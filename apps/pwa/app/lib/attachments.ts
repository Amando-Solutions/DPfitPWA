/**
 * Turning picked files into something the data source can store.
 *
 * Nothing here uploads: it decodes, downscales and measures, then hands the
 * result over. Where the bytes end up — a Cloud Storage bucket, or a data URL
 * in Web Storage in mock mode — is the data source's decision, and this file
 * deliberately cannot tell the difference.
 *
 * Photos go through the same downscale as progress shots, then a byte budget on
 * top: a chat thread is the one collection that grows without limit. The cap on
 * other files exists for the same reason and is generous enough that nothing a
 * coach would actually be sent hits it.
 */

import { processImage, type ProcessedImage } from '~/lib/image'
import type { PendingFile } from '~/lib/datasource'

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

/** Ceiling for non-image files. */
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

const readAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error(`Could not read “${file.name}”.`))
    reader.onload = () => resolve(String(reader.result))
    reader.readAsDataURL(file)
  })

/**
 * A picked file, decoded and ready to hand to the data source.
 *
 * Images and other files travel separately because they are stored
 * differently: an image has been re-encoded and has dimensions worth recording,
 * a file is passed through as it was picked.
 */
export type PendingAttachment =
  | { kind: 'image'; name: string; mimeType: string; image: ProcessedImage }
  | { kind: 'file'; file: PendingFile }

/** Rejects with a user-facing message; callers surface it in the composer. */
export const fileToPending = async (file: File): Promise<PendingAttachment> => {
  if (file.type.startsWith('image/')) {
    return {
      kind: 'image',
      name: file.name,
      mimeType: file.type,
      image: await processImage(file, IMAGE_MAX_EDGE, IMAGE_MAX_BYTES),
    }
  }

  if (file.size > MAX_FILE_BYTES) {
    throw new Error(
      `“${file.name}” is too big. Files need to be under ${formatBytes(MAX_FILE_BYTES)}.`,
    )
  }

  return {
    kind: 'file',
    file: {
      name: file.name,
      bytes: file.size,
      mimeType: file.type,
      dataUrl: await readAsDataUrl(file),
    },
  }
}

/** What a pending attachment looks like in the composer, before it is sent. */
export const previewOf = (pending: PendingAttachment) =>
  pending.kind === 'image'
    ? { name: pending.name, bytes: pending.image.bytes, url: pending.image.dataUrl }
    : { name: pending.file.name, bytes: pending.file.bytes, url: '' }
