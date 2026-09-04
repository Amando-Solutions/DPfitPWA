/**
 * Photo handling for proof-of-workout shots, progress shots and chat photos.
 *
 * Camera output is several megabytes. Everything that gets persisted goes
 * through `processImage` first, which downscales and re-encodes to JPEG — worth
 * doing against Cloud Storage for the upload time alone, and load-bearing in
 * mock mode, where the whole app shares one ~5 MB Web Storage budget.
 *
 * The dimensions come back with the bytes because `StoredImage` records both:
 * a gallery that knows a photo's aspect ratio before it loads does not reflow
 * when it arrives.
 */

const MAX_EDGE = 900

/** Tried in order when a byte budget is set; the first that fits wins. */
const QUALITY_STEPS = [0.72, 0.6, 0.48, 0.38]

/**
 * How long a decode is given before it is treated as failed.
 *
 * A decode that runs out of memory does not reliably reject. On a phone the
 * browser can drop the work and fire neither `load` nor `error`, which left the
 * caller awaiting a promise that would never settle: the chat composer sat with
 * its buttons disabled and nothing on screen, indefinitely. A stalled decode
 * has to turn into something the member can act on.
 */
const DECODE_TIMEOUT_MS = 20_000

const TOO_BIG = 'That photo was too large to process. Try a smaller one.'

/** Rejects `promise` with `message` if it has not settled within `ms`. */
const withTimeout = <T>(promise: Promise<T>, ms: number, message: string): Promise<T> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms)
    const done = <A>(fn: (value: A) => void) => (value: A) => {
      clearTimeout(timer)
      fn(value)
    }
    promise.then(done(resolve), done(reject))
  })

/** A decoded image plus the handle needed to let go of it again. */
interface Decoded {
  source: CanvasImageSource
  width: number
  height: number
  release: () => void
}

/**
 * Decode `file`, without routing its bytes through a JavaScript string.
 *
 * This used to read the file into a base64 data URL and set that as an `<img>`
 * src, so a 12 MP photo cost a ~1.9 MB string *and* a decode of that string on
 * top of the bitmap itself. Handing the Blob to the decoder skips both, and
 * `createImageBitmap` returns a handle that can be released as soon as it has
 * been drawn rather than whenever the collector next runs. The `<img>` path
 * stays for engines without it (Safari before 15), on an object URL for the
 * same reason.
 */
const decode = (file: File): Promise<Decoded> => {
  if (typeof createImageBitmap === 'function') {
    return withTimeout(createImageBitmap(file), DECODE_TIMEOUT_MS, TOO_BIG).then(
      (bitmap) => ({
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      }),
    )
  }

  const url = URL.createObjectURL(file)
  const image = new Image()
  const release = () => {
    image.onload = null
    image.onerror = null
    image.src = ''
    URL.revokeObjectURL(url)
  }

  const loaded = new Promise<Decoded>((resolve, reject) => {
    image.onload = () =>
      resolve({
        source: image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        release,
      })
    image.onerror = () => reject(new Error('Could not decode that image.'))
    image.src = url
  })

  return withTimeout(loaded, DECODE_TIMEOUT_MS, TOO_BIG).catch((error) => {
    release()
    throw error
  })
}

/** A processed image, ready to be handed to the data source for storage. */
export interface ProcessedImage {
  /** `data:image/jpeg;base64,…` */
  dataUrl: string
  width: number
  height: number
  bytes: number
}

/**
 * Read `file` into a downscaled JPEG.
 *
 * `maxEdge` caps the longest side. `maxBytes`, when given, steps the quality
 * down until the result fits. The last step is returned either way, so an
 * awkward photo still goes through rather than failing outright.
 *
 * Rejects with a message written for the member, so callers can show it as-is.
 */
export const processImage = async (
  file: File,
  maxEdge = MAX_EDGE,
  maxBytes?: number,
): Promise<ProcessedImage> => {
  if (!file.type.startsWith('image/')) throw new Error('That file isn’t an image.')

  const decoded = await decode(file)
  try {
    const scale = Math.min(1, maxEdge / Math.max(decoded.width, decoded.height))
    const width = Math.round(decoded.width * scale)
    const height = Math.round(decoded.height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Could not process that image.')

    try {
      context.drawImage(decoded.source, 0, 0, width, height)

      // One decode, one draw, then as many encodes as the budget needs.
      let encoded = ''
      for (const quality of QUALITY_STEPS) {
        encoded = canvas.toDataURL('image/jpeg', quality)
        if (maxBytes === undefined || dataUrlBytes(encoded) <= maxBytes) break
      }
      return { dataUrl: encoded, width, height, bytes: dataUrlBytes(encoded) }
    } finally {
      // Sizing the canvas to 0×0 releases its backing store. Left alone it sits
      // there until the next collection, which on WebKit is long enough that a
      // few photos in a row can push a mobile tab over its limit.
      canvas.width = 0
      canvas.height = 0
    }
  } finally {
    decoded.release()
  }
}

/** Rough byte size of a data URL, for quota warnings. */
export const dataUrlBytes = (dataUrl: string): number => {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  return Math.round((base64.length * 3) / 4)
}
