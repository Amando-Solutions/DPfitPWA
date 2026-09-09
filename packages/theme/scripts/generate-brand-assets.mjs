/**
 * Regenerates `public/brand/` from the brand SVGs in `/logo`.
 *
 * The mark is vector, and everything the apps render in the page is vector too
 * — `BrandLogo` and `BrandIcon` next door. What has to be raster is the set a
 * browser, an OS or a mail client will not take an SVG for: the ICO a legacy
 * tab bar wants, the PNG iOS pins to a home screen, the manifest icons Android
 * renders, the share card a link unfurls into, and the two lockups the
 * access-code email hangs off an `<img>`. Those are what this writes, and
 * nothing else, because every other use of the logo should be reaching for the
 * components.
 *
 * Run it after changing anything in `/logo`:
 *
 *   bun run --filter @dpfit/theme brand:assets
 *
 * It drives headless Chromium (via `playwright-core`, already present for the
 * PWA's own tooling) rather than taking a dependency on a native rasteriser,
 * so there is nothing to install and the output is the same renderer the mark
 * is drawn by in production.
 */
import { chromium } from 'playwright-core'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const here = (p) => fileURLToPath(new URL(p, import.meta.url))
const repo = (p) => fileURLToPath(new URL(`../../../${p}`, import.meta.url))

const OUT = here('../public/brand/')
mkdirSync(OUT, { recursive: true })

// --- The source geometry ----------------------------------------------------
// Pulled out of the export rather than pasted in, so the artwork has exactly
// one home and this file cannot drift from it.
const markPath = readFileSync(repo('logo/Colored icon.svg'), 'utf8')
  .match(/<path d="([^"]+)"/)?.[1]
if (!markPath) throw new Error('logo/Colored icon.svg: no path found')

/**
 * The full lockup, for the share card and the email mastheads. Its mark is a
 * separately positioned copy rather than `markPath` under a transform, so it
 * is read from the export too: the spacing between mark and wordmark is the
 * designer's, not ours.
 *
 * Each path is read with the fill it was exported with, so a colourway is
 * picked by naming a file rather than by choosing colours here. All four
 * lockup exports are the same ten paths in the same order, the mark last.
 */
const lockupOf = (file) => {
  const paths = [
    ...readFileSync(repo(file), 'utf8').matchAll(
      /<path d="([^"]+)" fill="([^"]+)"/g,
    ),
  ].map((m) => ({ d: m[1], fill: m[2] }))
  if (paths.length !== 10) {
    throw new Error(`${file}: expected 10 paths, found ${paths.length}`)
  }
  return paths
}

const lockupPaths = lockupOf('logo/White full logo.svg').map((p) => p.d)

const MARK_W = 90
const MARK_H = 57
const LOCKUP_W = 119
const LOCKUP_H = 93
const PLUM = '#430f32'
/** `--surface-raised`, and the manifest's `background_color`. */
const CREAM = '#fbf6f2'

/**
 * The mark, centred in a square.
 *
 * `scale` is the fraction of the square's width the mark spans. The regular
 * icons take the designer's own favicon proportion; the maskable one is pulled
 * in well inside the safe zone, because Android crops it to a circle on some
 * launchers and a squircle on others and the mark has to survive both.
 */
const square = ({ size, scale, bg }) => {
  const w = size * scale
  const h = (w * MARK_H) / MARK_W
  const x = (size - w) / 2
  const y = (size - h) / 2
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  ${bg ? `<rect width="${size}" height="${size}" fill="${bg}"/>` : ''}
  <g transform="translate(${x} ${y}) scale(${w / MARK_W})">
    <path d="${markPath}" fill="${PLUM}"/>
  </g>
</svg>`
}

// --- What gets written ------------------------------------------------------
const targets = [
  // Transparent: the tab bar supplies its own ground, in either theme.
  { file: 'favicon-32.png', size: 32, scale: 0.78, bg: null },
  // iOS composites a home-screen icon onto black, so this one needs a ground.
  { file: 'apple-touch-icon.png', size: 180, scale: 0.64, bg: CREAM },
  { file: 'icon-192.png', size: 192, scale: 0.64, bg: CREAM },
  { file: 'icon-512.png', size: 512, scale: 0.64, bg: CREAM },
  { file: 'icon-512-maskable.png', size: 512, scale: 0.5, bg: CREAM },
]

const browser = await chromium.launch()
const page = await browser.newPage()

/** Renders one square and hands back the PNG bytes. */
const render = async ({ size, scale, bg }) => {
  const svg = square({ size, scale, bg })
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(
    `<style>html,body{margin:0;padding:0;background:transparent}</style>${svg}`,
  )
  return page.screenshot({
    omitBackground: !bg,
    clip: { x: 0, y: 0, width: size, height: size },
  })
}

for (const { file, size, scale, bg } of targets) {
  writeFileSync(OUT + file, await render({ size, scale, bg }))
  console.log(`✓ ${file}  ${size}x${size}${bg ? '' : '  (transparent)'}`)
}

/**
 * The ICO, packed here rather than copied out of `/logo`.
 *
 * The designer's export is a single uncompressed 256x256 BMP, which is 270 kB
 * of the exact artwork the 1 kB `favicon.svg` beside it already carries. Since
 * every current browser takes the SVG or the 32px PNG and only reaches for
 * `/favicon.ico` as a last resort, spending a quarter of a megabyte on that
 * fallback is the wrong trade. This is the same mark at the three sizes a
 * fallback is actually asked for, PNG-compressed inside the ICO container —
 * which browsers have understood since Vista.
 */
const icoSizes = [16, 32, 48]
const icoPngs = []
for (const size of icoSizes) {
  icoPngs.push(await render({ size, scale: 0.86, bg: null }))
}

/**
 * The share card — what every link to the landing page unfurls into.
 *
 * 1200x630 is the size Open Graph and Twitter both size a large card to. The
 * art is the hero's own: `--night` under the same two radial washes, so a
 * shared link looks like the page it opens. The lockup is the all-white
 * export, because the ground is the darkest colour the brand has.
 *
 * No headline. The title and description travel as their own meta tags and
 * every platform renders them right beside the image, so setting them in the
 * picture too would only repeat them — and would put this build on the network
 * for a webfont it otherwise never needs.
 */
const OG_W = 1200
const OG_H = 630
const lockupH = 300
const lockupW = (lockupH * LOCKUP_W) / LOCKUP_H

const og = `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_W}" height="${OG_H}" viewBox="0 0 ${OG_W} ${OG_H}">
  <rect width="${OG_W}" height="${OG_H}" fill="#0f0a14"/>
  <defs>
    <radialGradient id="rose" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#c81e5c" stop-opacity="0.34"/>
      <stop offset="45%" stop-color="#c81e5c" stop-opacity="0.05"/>
      <stop offset="70%" stop-color="#c81e5c" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="amber" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#e8a33d" stop-opacity="0.18"/>
      <stop offset="66%" stop-color="#e8a33d" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <ellipse cx="${OG_W / 2}" cy="60" rx="700" ry="440" fill="url(#rose)"/>
  <ellipse cx="${OG_W - 60}" cy="${OG_H - 40}" rx="420" ry="420" fill="url(#amber)"/>
  <g transform="translate(${(OG_W - lockupW) / 2} ${(OG_H - lockupH) / 2}) scale(${lockupH / LOCKUP_H})">
    ${lockupPaths.map((d) => `<path d="${d}" fill="#ffffff"/>`).join('\n    ')}
  </g>
</svg>`

await page.setViewportSize({ width: OG_W, height: OG_H })
await page.setContent(`<style>html,body{margin:0;padding:0}</style>${og}`)
writeFileSync(
  OUT + 'og.png',
  await page.screenshot({ clip: { x: 0, y: 0, width: OG_W, height: OG_H } }),
)
console.log(`✓ og.png  ${OG_W}x${OG_H}`)

/**
 * The lockup as a flat PNG, for the one surface that can take neither the
 * component nor an SVG: the access-code email.
 *
 * A mail client is not a browser. Gmail strips `<svg>` outright and refuses a
 * `data:` URI on an `<img>`, so a hosted raster is the only way an email
 * carries the real artwork rather than a typeset approximation of it.
 *
 * Two colourways, because the email has two grounds: the all-white export for
 * the night masthead (and for the footer of a client in dark mode), the plum
 * mark over a black wordmark for the footer on paper. Both fills come from the
 * designer's own exports, so nothing about the colour is decided here.
 *
 * 192px wide is 3x the 64px the masthead shows it at, which is what a retina
 * inbox asks for. Transparent, so each one sits on whichever ground it lands.
 */
const EMAIL_LOGO_W = 192
const EMAIL_LOGO_H = Math.round((EMAIL_LOGO_W * LOCKUP_H) / LOCKUP_W)

for (const [file, source] of [
  ['logo-white.png', 'logo/White full logo.svg'],
  ['logo-color.png', 'logo/Colored full logo black wordmark.svg'],
]) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${EMAIL_LOGO_W}" height="${EMAIL_LOGO_H}" viewBox="0 0 ${LOCKUP_W} ${LOCKUP_H}">
  ${lockupOf(source)
    .map(({ d, fill }) => `<path d="${d}" fill="${fill}"/>`)
    .join('\n  ')}
</svg>`
  await page.setViewportSize({ width: EMAIL_LOGO_W, height: EMAIL_LOGO_H })
  await page.setContent(
    `<style>html,body{margin:0;padding:0;background:transparent}</style>${svg}`,
  )
  writeFileSync(
    OUT + file,
    await page.screenshot({
      omitBackground: true,
      clip: { x: 0, y: 0, width: EMAIL_LOGO_W, height: EMAIL_LOGO_H },
    }),
  )
  console.log(`✓ ${file}  ${EMAIL_LOGO_W}x${EMAIL_LOGO_H}  (transparent)`)
}

await browser.close()

const header = Buffer.alloc(6)
header.writeUInt16LE(0, 0) // reserved
header.writeUInt16LE(1, 2) // 1 = icon
header.writeUInt16LE(icoSizes.length, 4)

let offset = 6 + 16 * icoSizes.length
const entries = icoPngs.map((png, i) => {
  const e = Buffer.alloc(16)
  e.writeUInt8(icoSizes[i] === 256 ? 0 : icoSizes[i], 0) // width
  e.writeUInt8(icoSizes[i] === 256 ? 0 : icoSizes[i], 1) // height
  e.writeUInt8(0, 2) // palette size: none, it is truecolour
  e.writeUInt8(0, 3) // reserved
  e.writeUInt16LE(1, 4) // colour planes
  e.writeUInt16LE(32, 6) // bits per pixel
  e.writeUInt32LE(png.length, 8)
  e.writeUInt32LE(offset, 12)
  offset += png.length
  return e
})

// The one file that does NOT live under `brand/`: a browser asks for
// `/favicon.ico` at the site root on its own, with no `<link>` telling it to,
// so that is where it has to be.
const ico = Buffer.concat([header, ...entries, ...icoPngs])
writeFileSync(here('../public/favicon.ico'), ico)
console.log(
  `✓ favicon.ico  → public/  ${icoSizes.join('/')}px, ${(ico.length / 1024).toFixed(1)} kB`,
)

// The scalable favicon, which is what every current browser actually uses.
writeFileSync(OUT + 'favicon.svg', square({ size: 100, scale: 0.78, bg: null }) + '\n')
console.log('✓ favicon.svg')
