#!/usr/bin/env node
/**
 * Build browser-compatible IIFE bundle for @areb0s/ocr-browser
 * 
 * This creates a bundle that can be loaded via fetch + new Function() in Workers
 */

import * as esbuild from 'esbuild';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const distDir = join(rootDir, 'dist');

/**
 * Plugin to handle Node.js built-ins for browser builds
 */
const nodeBuiltinsPlugin = {
  name: 'node-builtins',
  setup(build) {
    // Mark Node.js built-ins as external and provide empty shims
    const nodeBuiltins = ['fs', 'path', 'crypto', 'os', 'stream', 'util', 'buffer'];
    
    nodeBuiltins.forEach(mod => {
      build.onResolve({ filter: new RegExp(`^${mod}$`) }, () => ({
        path: mod,
        namespace: 'node-builtin-shim'
      }));
    });
    
    build.onLoad({ filter: /.*/, namespace: 'node-builtin-shim' }, () => ({
      contents: 'export default {}; export const readFileSync = () => {}; export const existsSync = () => false;',
      loader: 'js'
    }));
  }
};

/**
 * Plugin to make onnxruntime-web use global variable
 * Worker must have onnxruntime-web loaded as `self.ort` before loading this bundle
 */
const onnxGlobalPlugin = {
  name: 'onnx-global',
  setup(build) {
    build.onResolve({ filter: /^onnxruntime-web$/ }, () => ({
      path: 'onnxruntime-web',
      namespace: 'onnx-global'
    }));
    
    build.onLoad({ filter: /.*/, namespace: 'onnx-global' }, () => ({
      // Reference global `ort` variable (must be set before loading this bundle)
      contents: `
        var g = typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : globalThis;
        if (!g.ort) throw new Error('onnxruntime-web must be loaded before ocr-browser. Set self.ort or window.ort');
        module.exports = g.ort;
      `,
      loader: 'js'
    }));
  }
};

async function build() {
  console.log('Building IIFE bundle for Worker/CDN usage...');

  try {
    // Build the IIFE bundle
    await esbuild.build({
      entryPoints: [join(rootDir, 'src/index.ts')],
      bundle: true,
      format: 'iife',
      globalName: 'OcrModule',
      outfile: join(distDir, 'ocr-browser.js'),
      platform: 'browser',
      target: ['es2020'],
      minify: false,
      sourcemap: true,
      
      // Plugins
      plugins: [nodeBuiltinsPlugin, onnxGlobalPlugin],
      
      // Footer: expose to global scope (Worker, Browser, Node.js)
      footer: {
        js: `
// Expose OCR globally (works in Worker, Browser, Node.js)
(function(g) {
  g.Ocr = OcrModule.default || OcrModule;
  g.OcrModule = OcrModule;
  // Also expose named exports
  if (OcrModule.ImageRaw) g.ImageRaw = OcrModule.ImageRaw;
})(typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : globalThis);
`
      },

      logLevel: 'info',
    });

    console.log('IIFE bundle created: dist/ocr-browser.js');

    // Minified version
    await esbuild.build({
      entryPoints: [join(rootDir, 'src/index.ts')],
      bundle: true,
      format: 'iife',
      globalName: 'OcrModule',
      outfile: join(distDir, 'ocr-browser.min.js'),
      platform: 'browser',
      target: ['es2020'],
      minify: true,
      sourcemap: 'external',
      plugins: [nodeBuiltinsPlugin, onnxGlobalPlugin],
      footer: {
        js: `(function(g){g.Ocr=OcrModule.default||OcrModule;g.OcrModule=OcrModule;if(OcrModule.ImageRaw)g.ImageRaw=OcrModule.ImageRaw;})(typeof self!=='undefined'?self:typeof window!=='undefined'?window:globalThis);`
      },
    });

    console.log('Minified bundle created: dist/ocr-browser.min.js');
    console.log('\nUsage in Worker:');
    console.log('  // onnxruntime-web must be available globally');
    console.log('  const response = await fetch(CDN_URL + "ocr-browser.min.js");');
    console.log('  new Function(await response.text())();');
    console.log('  const ocr = await self.Ocr.create({ models: {...} });');

  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();
