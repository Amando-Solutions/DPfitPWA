import { useEffect } from "react"
import { ChevronLeftIcon, ChevronRightIcon, ExternalLinkIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"

export type LightboxImage = { url: string; alt: string; caption?: string }

/**
 * A photo at full size over the page. With several images, the arrows (or the
 * ← and → keys) step through them; Escape or the close button dismisses it.
 */
export function ImageLightbox({ images, index, onIndexChange }: {
  images: LightboxImage[]
  /** The open image, or null when closed. */
  index: number | null
  onIndexChange: (index: number | null) => void
}) {
  const image = index === null ? null : images[index] ?? null
  const many = images.length > 1
  const step = (delta: number) => index !== null && onIndexChange((index + delta + images.length) % images.length)

  useEffect(() => {
    if (index === null || !many) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") onIndexChange((index - 1 + images.length) % images.length)
      if (event.key === "ArrowRight") onIndexChange((index + 1) % images.length)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [index, many, images.length, onIndexChange])

  return <Dialog open={!!image} onOpenChange={(open) => !open && onIndexChange(null)}>
    <DialogContent className="gap-3 p-3 sm:max-w-[min(64rem,calc(100vw-2rem))]">
      {image && <>
        <DialogTitle className="sr-only">{image.alt}</DialogTitle>
        <div className="relative flex items-center justify-center overflow-hidden rounded-lg bg-black">
          <img src={image.url} alt={image.alt} className="max-h-[78vh] w-auto max-w-full object-contain" />
          {many && <>
            <Button type="button" variant="secondary" size="icon" className="absolute top-1/2 left-2 -translate-y-1/2 rounded-full opacity-80 hover:opacity-100" aria-label="Previous photo" onClick={() => step(-1)}><ChevronLeftIcon /></Button>
            <Button type="button" variant="secondary" size="icon" className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full opacity-80 hover:opacity-100" aria-label="Next photo" onClick={() => step(1)}><ChevronRightIcon /></Button>
          </>}
        </div>
        <div className="flex items-center justify-between gap-3 pr-8">
          <DialogDescription className="truncate">{image.caption ?? image.alt}{many ? ` · ${index! + 1} of ${images.length}` : ""}</DialogDescription>
          <Button variant="ghost" size="sm" render={<a href={image.url} target="_blank" rel="noreferrer" />}><ExternalLinkIcon data-icon="inline-start" />Open original</Button>
        </div>
      </>}
    </DialogContent>
  </Dialog>
}
