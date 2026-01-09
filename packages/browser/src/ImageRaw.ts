import { ImageRawBase } from '@areb0s/ocr-common'
import type { ImageRawData, LineImage, SizeOption, BrowserImageInput } from '@areb0s/ocr-common'
import invariant from 'tiny-invariant'

export class ImageRaw extends ImageRawBase {
  data: Uint8ClampedArray
  #imageData: ImageData
  #canvas: HTMLCanvasElement

  // ===========================================
  // Type Guards
  // ===========================================

  /**
   * Check if the input is an ImageBitmap
   */
  static isImageBitmap(input: unknown): input is ImageBitmap {
    return typeof ImageBitmap !== 'undefined' && input instanceof ImageBitmap
  }

  /**
   * Check if the input is an HTMLImageElement
   */
  static isHTMLImageElement(input: unknown): input is HTMLImageElement {
    return typeof HTMLImageElement !== 'undefined' && input instanceof HTMLImageElement
  }

  /**
   * Check if the input is an HTMLCanvasElement
   */
  static isHTMLCanvasElement(input: unknown): input is HTMLCanvasElement {
    return typeof HTMLCanvasElement !== 'undefined' && input instanceof HTMLCanvasElement
  }

  /**
   * Check if the input is an HTMLVideoElement
   */
  static isHTMLVideoElement(input: unknown): input is HTMLVideoElement {
    return typeof HTMLVideoElement !== 'undefined' && input instanceof HTMLVideoElement
  }

  /**
   * Check if the input is ImageRawData
   */
  static isImageRawData(input: unknown): input is ImageRawData {
    return (
      typeof input === 'object' &&
      input !== null &&
      'data' in input &&
      'width' in input &&
      'height' in input &&
      (input.data instanceof Uint8Array || input.data instanceof Uint8ClampedArray)
    )
  }

  // ===========================================
  // Factory Methods
  // ===========================================

  /**
   * Universal factory method that accepts all browser image input types
   * @param input - URL string, ImageRawData, ImageBitmap, HTMLImageElement, HTMLCanvasElement, or HTMLVideoElement
   * @returns Promise<ImageRaw>
   */
  static async from(input: BrowserImageInput): Promise<ImageRaw> {
    // String (URL or data URL)
    if (typeof input === 'string') {
      return ImageRaw.open(input)
    }

    // ImageBitmap
    if (ImageRaw.isImageBitmap(input)) {
      return ImageRaw.fromImageBitmap(input)
    }

    // HTMLImageElement
    if (ImageRaw.isHTMLImageElement(input)) {
      return ImageRaw.fromHTMLImageElement(input)
    }

    // HTMLCanvasElement
    if (ImageRaw.isHTMLCanvasElement(input)) {
      return ImageRaw.fromHTMLCanvasElement(input)
    }

    // HTMLVideoElement
    if (ImageRaw.isHTMLVideoElement(input)) {
      return ImageRaw.fromHTMLVideoElement(input)
    }

    // ImageRawData (fallback)
    if (ImageRaw.isImageRawData(input)) {
      return new ImageRaw(input)
    }

    throw new Error('Unsupported image input type')
  }

  /**
   * Create ImageRaw from a URL (existing method)
   */
  static async open(url: string): Promise<ImageRaw> {
    const image = await imageFromUrl(url)
    const canvas = document.createElement('canvas')
    canvasDrawImage(canvas, image, image.naturalWidth, image.naturalHeight)
    const imageData = canvasGetImageData(canvas)
    return new ImageRaw({
      data: imageData.data,
      width: imageData.width,
      height: imageData.height,
    })
  }

  /**
   * Create ImageRaw from an ImageBitmap
   * Note: This method will close the ImageBitmap after conversion to free memory
   * @param bitmap - ImageBitmap to convert
   * @returns Promise<ImageRaw>
   */
  static async fromImageBitmap(bitmap: ImageBitmap): Promise<ImageRaw> {
    // Validate bitmap
    if (bitmap.width === 0 || bitmap.height === 0) {
      throw new Error('Invalid ImageBitmap: dimensions are zero (bitmap may be closed or neutered)')
    }

    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height

    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) {
      // Cleanup before throwing
      try {
        bitmap.close()
      } catch {
        // Ignore if already closed
      }
      throw new Error('Failed to create canvas 2D context')
    }

    try {
      ctx.drawImage(bitmap, 0, 0)
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)

      return new ImageRaw({
        data: imageData.data,
        width: imageData.width,
        height: imageData.height,
      })
    } finally {
      // Always close the bitmap to free memory
      try {
        bitmap.close()
      } catch {
        // Ignore if already closed or neutered
      }
    }
  }

  /**
   * Create ImageRaw from an HTMLImageElement
   * @param img - HTMLImageElement to convert (must be loaded/decoded)
   * @returns Promise<ImageRaw>
   */
  static async fromHTMLImageElement(img: HTMLImageElement): Promise<ImageRaw> {
    // Ensure image is loaded
    if (!img.complete || img.naturalWidth === 0) {
      await img.decode()
    }

    const canvas = document.createElement('canvas')
    canvasDrawImage(canvas, img, img.naturalWidth, img.naturalHeight)
    const imageData = canvasGetImageData(canvas)

    return new ImageRaw({
      data: imageData.data,
      width: imageData.width,
      height: imageData.height,
    })
  }

  /**
   * Create ImageRaw from an HTMLCanvasElement
   * @param canvas - HTMLCanvasElement to convert
   * @returns Promise<ImageRaw>
   */
  static async fromHTMLCanvasElement(canvas: HTMLCanvasElement): Promise<ImageRaw> {
    const imageData = canvasGetImageData(canvas)

    return new ImageRaw({
      data: imageData.data,
      width: imageData.width,
      height: imageData.height,
    })
  }

  /**
   * Create ImageRaw from an HTMLVideoElement (captures current frame)
   * @param video - HTMLVideoElement to capture from
   * @returns Promise<ImageRaw>
   */
  static async fromHTMLVideoElement(video: HTMLVideoElement): Promise<ImageRaw> {
    if (video.readyState < 2) {
      throw new Error('Video is not ready. Ensure video has loaded metadata and data.')
    }

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) {
      throw new Error('Failed to create canvas 2D context')
    }

    ctx.drawImage(video, 0, 0)
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)

    return new ImageRaw({
      data: imageData.data,
      width: imageData.width,
      height: imageData.height,
    })
  }

  // ===========================================
  // Constructor & Instance Methods
  // ===========================================

  constructor({ data, width, height }: ImageRawData) {
    const newData = Uint8ClampedArray.from(data)
    super({
      data: newData,
      width,
      height,
    })
    const canvas = document.createElement('canvas')
    const imageData = new ImageData(newData, width, height)
    canvasPutImageData(canvas, imageData)
    this.#canvas = canvas
    this.#imageData = imageData
    this.data = newData // this.data is undefined without this line
  }

  async write(path: string) {
    document.body.append(this.#canvas)
  }

  async resize({ width, height }: SizeOption) {
    invariant(width !== undefined || height !== undefined, 'both width and height are undefined')
    const newWidth = width || Math.round((this.width / this.height) * height!)
    const newHeight = height || Math.round((this.height / this.width) * width!)
    const newCanvas = document.createElement('canvas')
    canvasDrawImage(newCanvas, this.#canvas, newWidth, newHeight)
    const newImageData = canvasGetImageData(newCanvas)
    return this.#apply(newImageData)
  }

  async drawBox(lineImages: LineImage[]) {
    this.#ctx.strokeStyle = 'red'
    for (const lineImage of lineImages) {
      const [first, ...rests] = lineImage.box
      this.#ctx.beginPath()
      this.#ctx.moveTo(first[0], first[1])
      for (const rest of rests) {
        this.#ctx.lineTo(rest[0], rest[1])
      }
      this.#ctx.closePath()
      this.#ctx.stroke()
    }
    return this
  }

  get #ctx() {
    return this.#canvas.getContext('2d')!
  }

  #apply(imageData: ImageData) {
    canvasPutImageData(this.#canvas, imageData)
    this.#imageData = imageData
    this.data = imageData.data
    this.width = imageData.width
    this.height = imageData.height
    return this
  }

  #putImageData() {
    this.#canvas.width = this.width
    this.#canvas.height = this.height
    this.#ctx.putImageData(this.#imageData, 0, 0)
    return this
  }

  #drawImage(image: CanvasImageSource, width?: number, height?: number) {
    canvasDrawImage(this.#canvas, image, width, height)
    return this
  }
}

// ===========================================
// Helper Functions
// ===========================================

function canvasDrawImage(canvas: HTMLCanvasElement, image: CanvasImageSource, width?: number, height?: number) {
  canvas.width = width || (image as any).width
  canvas.height = height || (image as any).height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
}

function canvasPutImageData(canvas: HTMLCanvasElement, imageData: ImageData, width?: number, height?: number) {
  const ctx = canvas.getContext('2d')!
  canvas.width = width || imageData.width
  canvas.height = height || imageData.height
  ctx.putImageData(imageData, 0, 0)
}

function canvasGetImageData(canvas: HTMLCanvasElement) {
  return canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height)
}

async function imageFromUrl(url: string) {
  const image = new Image()
  image.src = url
  await image.decode()
  return image
}
