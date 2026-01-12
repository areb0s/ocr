import type { ImageRawData, BrowserImageInput, ModelCreateOptions } from '#common/types'
import { Detection, Recognition } from './models'

export class Ocr {
  static async create(options: ModelCreateOptions = {}) {
    const detection = await Detection.create(options)
    const recognition = await Recognition.create(options)
    return new Ocr({ detection, recognition })
  }

  #detection: Detection
  #recognition: Recognition
  #mutex: Promise<void> = Promise.resolve()

  constructor({
    detection,
    recognition,
  }: {
    detection: Detection
    recognition: Recognition
  }) {
    this.#detection = detection
    this.#recognition = recognition
  }

  /**
   * Detect text from image
   * Note: Calls are automatically serialized to prevent "Session already started" error
   */
  async detect(image: string | ImageRawData | BrowserImageInput, options = {}) {
    // Queue this call behind any pending operations
    const currentMutex = this.#mutex
    let releaseMutex: () => void
    this.#mutex = new Promise((resolve) => {
      releaseMutex = resolve
    })

    try {
      // Wait for previous operation to complete
      await currentMutex
      // Execute detection
      return await this.#detectInternal(image, options)
    } finally {
      // Release mutex for next operation
      releaseMutex!()
    }
  }

  async #detectInternal(image: string | ImageRawData | BrowserImageInput, options = {}) {
    const { lineImages, resizedImageWidth, resizedImageHeight } = await this.#detection.run(image, options)
    const texts = await this.#recognition.run(lineImages, options)
    return {
      texts,
      resizedImageWidth,
      resizedImageHeight,
    }
  }
}
