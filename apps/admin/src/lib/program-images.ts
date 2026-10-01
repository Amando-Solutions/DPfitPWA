import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage"

import { firebaseStorage } from "@/lib/firebase"
import type { StoredImage } from "@/lib/programs"

const MAX_INPUT_BYTES = 12 * 1024 * 1024
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024
const MAX_WIDTH = 1600
const MAX_HEIGHT = 900
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"])

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("The image could not be processed.")), type, quality)
  })
}

async function loadImage(file: File) {
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.decoding = "async"
    image.src = url
    await image.decode()
    return image
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function processProgramHero(file: File) {
  if (!ACCEPTED_TYPES.has(file.type)) throw new Error("Choose a JPEG, PNG, or WebP image.")
  if (file.size > MAX_INPUT_BYTES) throw new Error("Choose an image smaller than 12 MB.")

  const image = await loadImage(file)
  const scale = Math.min(1, MAX_WIDTH / image.naturalWidth, MAX_HEIGHT / image.naturalHeight)
  const width = Math.max(1, Math.round(image.naturalWidth * scale))
  const height = Math.max(1, Math.round(image.naturalHeight * scale))
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext("2d")
  if (!context) throw new Error("Image processing is unavailable in this browser.")
  context.drawImage(image, 0, 0, width, height)

  let blob = await canvasBlob(canvas, "image/webp", 0.84)
  let contentType = "image/webp"
  if (blob.type !== "image/webp") {
    blob = await canvasBlob(canvas, "image/jpeg", 0.84)
    contentType = "image/jpeg"
  }
  if (blob.size >= MAX_OUTPUT_BYTES) {
    throw new Error("The processed image is still too large. Choose a simpler or smaller image.")
  }
  return { blob, contentType, width, height }
}

export async function uploadProgramHero(
  programId: string,
  workoutDayId: string,
  file: File,
): Promise<StoredImage> {
  if (!firebaseStorage) throw new Error("Program image storage is not configured.")
  const processed = await processProgramHero(file)
  const extension = processed.contentType === "image/webp" ? "webp" : "jpg"
  const storagePath = `programs/${programId}/workoutDays/${workoutDayId}/hero/${crypto.randomUUID()}.${extension}`
  const reference = ref(firebaseStorage, storagePath)
  await uploadBytes(reference, processed.blob, {
    contentType: processed.contentType,
    cacheControl: "public,max-age=31536000,immutable",
  })
  return {
    storagePath,
    downloadUrl: await getDownloadURL(reference),
    width: processed.width,
    height: processed.height,
    bytes: processed.blob.size,
  }
}

export async function deleteProgramHero(storagePath: string) {
  if (!firebaseStorage || !storagePath) return
  await deleteObject(ref(firebaseStorage, storagePath))
}
