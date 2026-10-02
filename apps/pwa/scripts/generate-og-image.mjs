/**
 * Renders the boot splash to `public/og/card.png`, the app's share card.
 *
 * The card is the splash itself — the lockup, the tagline, the corner art and
 * the credit — read straight out of `app/spa-loading-template.html` rather
 * than redrawn, so the link preview and the first thing a member sees on
 * opening the app are the same frame. Run it after changing the splash:
 *
 *   bun run --filter dp-fitness-pwa og:image
 *
 * It is drawn at 1200 x 630, the 1.91:1 every platform lays a large card out
 * at, which puts the splash in its desktop arrangement (the 1024px breakpoint
 * and up), and in the light palette, which is the splash's default. Two things
 * are pinned that a live splash leaves to chance:
 *
 *   - Space Mono is waited for. The splash allows the fallback face for a
 *     frame; a screenshot would keep that frame forever.
 *   - The loading bar is stopped with its fill centred in the track, the
 *     still that reads as "loading" rather than as a bar stuck at one end.
 *
 * Drives headless Chromium through `playwright-core`, like the theme's
 * `brand:assets`. If the Chromium build Playwright expects is not the one on
 * this machine, point `CHROMIUM_PATH` at the one that is.
 */
import { chromium } from 'playwright-core'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const here = (p) => fileURLToPath(new URL(p, import.meta.url))

const W = 1200
const H = 630
const OUT = here('../public/og/')
mkdirSync(OUT, { recursive: true })

const splash = readFileSync(here('../app/spa-loading-template.html'), 'utf8')

const html = `<!doctype html>
<html data-theme="light">
<head>
  <meta charset="utf-8">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=block">
  <style>
    html, body { margin: 0; padding: 0; }
    .dp-boot__fill { animation: none !important; transform: translateX(75%) !important; }
  </style>
</head>
<body>${splash}</body>
</html>`

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH })
const page = await browser.newPage({ viewport: { width: W, height: H } })
await page.setContent(html, { waitUntil: 'networkidle' })
await page.evaluate(() => document.fonts.ready)

const loaded = await page.evaluate(() =>
  ['400', '700'].every((w) => document.fonts.check(`${w} 12px "Space Mono"`)),
)
if (!loaded) throw new Error('Space Mono did not load; the card would set in the fallback face')

writeFileSync(OUT + 'card.png', await page.screenshot({ clip: { x: 0, y: 0, width: W, height: H } }))
await browser.close()
console.log(`✓ public/og/card.png  ${W}x${H}`)
