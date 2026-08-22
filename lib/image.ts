/**
 * Photo handling for proof-of-workout and progress shots.
 *
 * Camera output is several megabytes; Web Storage gives us about five in total.
 * Everything that gets persisted goes through `readImageAsDataUrl` first, which
 * downscales and re-encodes to JPEG so a full six weeks of photos still fits.
 */

const MAX_EDGE = 900
const QUALITY = 0.72

export const readImageAsDataUrl = (file: File, maxEdge = MAX_EDGE): Promise<string> =>
  new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('That file isn’t an image.'))
      return
    }

    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read that file.'))
    reader.onload = () => {
      const image = new Image()

      /**
       * Hand the decoded bitmap and the canvas backing store back immediately.
       *
       * A 12 MP phone photo decodes to ~48 MB of RGBA, and the canvas holds a
       * second buffer on top. Left to the collector those sit around until the
       * next GC — long enough that picking a few shots in a row can push a
       * mobile tab over its limit, which on iOS is a reload rather than an
       * error. Dropping `src` releases the bitmap; sizing the canvas to 0×0
       * releases its buffer (WebKit in particular will not free it otherwise).
       */
      const release = () => {
        image.onload = null
        image.onerror = null
        image.src = ''
      }

      image.onerror = () => {
        release()
        reject(new Error('Could not decode that image.'))
      }

      image.onload = () => {
        const scale = Math.min(1, maxEdge / Math.max(image.width, image.height))
        const width = Math.round(image.width * scale)
        const height = Math.round(image.height * scale)

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const context = canvas.getContext('2d')
        if (!context) {
          // No canvas: fall back to the original bytes rather than failing.
          release()
          resolve(String(reader.result))
          return
        }
        context.drawImage(image, 0, 0, width, height)
        const encoded = canvas.toDataURL('image/jpeg', QUALITY)
        canvas.width = 0
        canvas.height = 0
        release()
        resolve(encoded)
      }

      image.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  })

/** Rough byte size of a data URL, for quota warnings. */
export const dataUrlBytes = (dataUrl: string): number => {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  return Math.round((base64.length * 3) / 4)
}
