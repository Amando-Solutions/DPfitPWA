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
      image.onerror = () => reject(new Error('Could not decode that image.'))
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
          resolve(String(reader.result))
          return
        }
        context.drawImage(image, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', QUALITY))
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
