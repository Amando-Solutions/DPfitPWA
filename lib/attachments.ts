/**
 * Turning picked files into chat attachments.
 *
 * Photos go through the same downscale as progress shots, then a byte budget on
 * top: a chat thread is the one collection that grows without limit, and the
 * whole app shares one ~5 MB Web Storage budget. Other files are base64'd into
 * the message as-is, so they are capped; an HTTP data source would upload them
 * instead and drop the cap.
 */

import { readImageAsDataUrl } from '~/lib/image'
import type { ChatAttachment } from '~/data/types'

/** Longest edge for a shared photo. */
const IMAGE_MAX_EDGE = 900

/**
 * Ceiling for one shared photo once it has been re-encoded.
 *
 * Progress photos are bounded (three poses, six weeks); a chat thread is not,
 * so a photo that is merely "not huge" still adds up. Quality steps down until
 * it fits.
 */
const IMAGE_MAX_BYTES = 160 * 1024

/** Ceiling for non-image files while attachments live in Web Storage. */
export const MAX_FILE_BYTES = 800 * 1024

/** Keeps one message from eating the storage budget on its own. */
export const MAX_ATTACHMENTS = 4

/** The paperclip takes anything a coach might reasonably be sent. */
export const FILE_ACCEPT =
  'image/*,application/pdf,text/plain,text/csv,.doc,.docx,.xls,.xlsx,.csv'

/** The camera button goes straight to the rear camera on mobile. */
export const IMAGE_ACCEPT = 'image/*'

export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const uid = () => `att-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

const readAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error(`Could not read “${file.name}”.`))
    reader.onload = () => resolve(String(reader.result))
    reader.readAsDataURL(file)
  })

/** Rejects with a user-facing message; callers surface it in the composer. */
export const fileToAttachment = async (file: File): Promise<ChatAttachment> => {
  const base = { id: uid(), name: file.name, size: file.size, mimeType: file.type }

  if (file.type.startsWith('image/')) {
    return {
      ...base,
      kind: 'image',
      url: await readImageAsDataUrl(file, IMAGE_MAX_EDGE, IMAGE_MAX_BYTES),
    }
  }

  if (file.size > MAX_FILE_BYTES) {
    throw new Error(
      `“${file.name}” is too big. Files need to be under ${formatBytes(MAX_FILE_BYTES)}.`,
    )
  }
  return { ...base, kind: 'file', url: await readAsDataUrl(file) }
}
