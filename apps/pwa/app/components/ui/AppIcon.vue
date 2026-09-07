<script setup lang="ts">

const props = withDefaults(
  defineProps<{
    name: string
    size?: number | string
    stroke?: number
    fill?: boolean
  }>(),
  { size: 24, stroke: 2, fill: false },
)

interface Glyph {
  viewBox: string
  inner: string
}

const rawFiles = import.meta.glob('../../assets/icons/*.svg', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

/** Colours that appear on rendered elements; `<defs>` content doesn't count. */
const visibleColours = (svg: string): string[] => {
  const body = svg.replace(/<defs>[\s\S]*?<\/defs>/g, '')
  const found = new Set<string>()
  for (const [, value] of body.matchAll(/\b(?:stroke|fill)="([^"]+)"/g)) {
    // The capture group is optional to the compiler even though the pattern
    // cannot match without it.
    if (value && value !== 'none') found.add(value.toLowerCase())
  }
  return [...found]
}

const toGlyph = (svg: string): Glyph => {
  const viewBox = svg.match(/viewBox="([^"]+)"/)?.[1] ?? '0 0 24 24'
  let inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')

  // One colour means the glyph is monochrome and safe to tint.
  if (visibleColours(svg).length === 1) {
    inner = inner
      .replace(/\bstroke="(?!none)[^"]*"/g, 'stroke="currentColor"')
      .replace(/\bfill="(?!none|white)[^"]*"/g, 'fill="currentColor"')
      // Figma bakes in the opacity of whichever *state* a glyph happened to be
      // exported from: the tab bar's chat, fuel and more icons came out of the
      // inactive tab at 50%, home and train out of the active one at full
      // strength. Tinting is meant to hand that decision to the caller's
      // `color`, so a stroke that stays half-transparent whatever the colour
      // says defeats it, and the bar ends up with one icon brighter than its
      // neighbours.
      .replace(/\s*\b(?:stroke|fill)-opacity="[^"]*"/g, '')
  }
  return { viewBox, inner }
}

/** Raw source keyed by glyph name, parsed on demand rather than up front. */
const sources: Record<string, string> = Object.fromEntries(
  Object.entries(rawFiles).map(([path, svg]) => [
    path.split('/').pop()!.replace('.svg', ''),
    svg,
  ]),
)

/**
 * `toGlyph` runs several regex passes over the file, and it used to run for all
 * of them at module-evaluation time: on the boot path, for glyphs a given screen
 * may never render. Parsing lazily and caching the result means each glyph is
 * processed at most once, the first time something actually asks for it.
 */
const glyphCache = new Map<string, Glyph | undefined>()

const glyphFor = (name: string): Glyph | undefined => {
  if (glyphCache.has(name)) return glyphCache.get(name)
  const source = sources[name]
  const parsed = source ? toGlyph(source) : undefined
  glyphCache.set(name, parsed)
  return parsed
}

// --- Fallbacks: glyphs the Figma file never exported -------------------------
const fallbacks: Record<string, string> = {
  arrowLeft: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  play: '<path d="M8 5.5v13l11-6.5-11-6.5Z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  settings:
    '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  calendar:
    '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M4 9h16M8 3v4M16 3v4"/>',
  image:
    '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="m4 18 5-5 4 4 3-3 4 4"/>',
  paperclip:
    '<path d="M20.4 11.6 12.5 19.5a5 5 0 0 1-7.1-7.1l8.3-8.3a3.3 3.3 0 0 1 4.7 4.7l-8.2 8.3a1.7 1.7 0 0 1-2.4-2.4l7.5-7.5"/>',
  file:
    '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z"/><path d="M14 3v5h5"/>',
  target:
    '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4"/>',
  send: '<path d="M4 12 20 4l-6 16-3-7-7-1Z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  phone:
    '<path d="M5 4h4l1.5 4-2 1.5a11 11 0 0 0 6 6l1.5-2 4 1.5V19a2 2 0 0 1-2 2A16 16 0 0 1 4 6a2 2 0 0 1 1-2Z"/>',
  edit: '<path d="M4 20h4L18 10l-4-4L4 16v4Z"/><path d="M13.5 6.5l4 4"/>',
  heart:
    '<path d="M12 20s-7-4.5-7-9.5A3.5 3.5 0 0 1 12 8a3.5 3.5 0 0 1 7 2.5c0 5-7 9.5-7 9.5Z"/>',
  star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.7l5.9-.9L12 3.5Z"/>',
  scale: '<path d="M12 4v4M6 8h12M6 8 3 16a4 4 0 0 0 6 0L6 8ZM18 8l-3 8a4 4 0 0 0 6 0l-3-8ZM9 20h6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/>',
  // iOS spells "share" as a box with an arrow leaving it, and the Add to
  // Home Screen instructions are unreadable without the same shape.
  share:
    '<path d="M12 3.5v10"/><path d="M8.5 7 12 3.5 15.5 7"/><path d="M7.5 10.5H6A2 2 0 0 0 4 12.5v6A2 2 0 0 0 6 20.5h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1.5"/>',
  download:
    '<path d="M12 3.5v10"/><path d="M8 10l4 3.5 4-3.5"/><path d="M4 16.5v2A2 2 0 0 0 6 20.5h12a2 2 0 0 0 2-2v-2"/>',
}

const glyph = computed(() => glyphFor(props.name))
const fallback = computed(() => fallbacks[props.name] ?? fallbacks.info)
</script>

<template>
  <svg
    v-if="glyph"
    class="block shrink-0"
    :width="size"
    :height="size"
    :viewBox="glyph.viewBox"
    fill="none"
    aria-hidden="true"
    v-html="glyph.inner"
  />
  <svg
    v-else
    class="block shrink-0"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    :fill="fill ? 'currentColor' : 'none'"
    :stroke="fill ? 'none' : 'currentColor'"
    :stroke-width="stroke"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    v-html="fallback"
  />
</template>
