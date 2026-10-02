/**
 * Renders the landing page's opening screen to `public/og/card.png`, the
 * site's share card.
 *
 * The card is the page itself — the header, the eyebrow, the headline, the
 * pitch and the calls to action — captured from a running copy of the site
 * rather than redrawn, so the link preview and the first screen a visitor
 * lands on are the same picture. Start the site, then run it:
 *
 *   bun run --filter dp-fitness-web dev
 *   bun run --filter dp-fitness-web og:image
 *
 * It reads `http://localhost:3001/` (the dev port); point `OG_SOURCE_URL` at
 * another copy, a `nuxt preview` say, to read that one instead.
 *
 * Everything that names a date is left out: the countdown strip and the row of
 * cohort facts under the headline. The card is a fixed file that scrapers
 * cache for weeks, so anything on it that changes with the cohort would be
 * stale by the next one. What remains is centred in the frame below the
 * header. The eyebrow still carries the cohort's length, so the script prints
 * it; rerun it if a cohort changes that.
 *
 * It is drawn at 1200 x 630, the 1.91:1 every platform lays a large card out
 * at, with reduced motion on, so the hero's fade-in is already settled.
 *
 * Drives headless Chromium through `playwright-core`, like the PWA's
 * `og:image`. If the Chromium build Playwright expects is not the one on this
 * machine, point `CHROMIUM_PATH` at the one that is.
 */
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const here = (p) => fileURLToPath(new URL(p, import.meta.url))

const W = 1200
const H = 630
const SOURCE = process.env.OG_SOURCE_URL || 'http://localhost:3001/'
const OUT = here('../public/og/')
mkdirSync(OUT, { recursive: true })

/**
 * Keeps the header and the hero's first section, which `HeroSection` renders
 * as the first child of `<main>`, and drops the rest of the page: the
 * countdown strip above the header, the dated facts row that follows the
 * hero, and everything below. The hero then fills what the header leaves of
 * the frame, centred, with its own top and bottom padding traded for that.
 */
const CARD_CSS = `
  #top > :not(header):not(main),
  #top > main > :not(:first-child) { display: none !important; }
  #top { height: ${H}px; display: flex; flex-direction: column; }
  #top > main { flex: 1; display: flex; flex-direction: column; justify-content: center; }
  #top > main > :first-child { width: 100%; box-sizing: border-box; padding-top: 0; padding-bottom: 24px; }
`

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH })
const page = await browser.newPage({ viewport: { width: W, height: H }, reducedMotion: 'reduce' })

const res = await page.goto(SOURCE, { waitUntil: 'networkidle' }).catch((err) => {
  throw new Error(`Could not load ${SOURCE}. Is the site running?\n${err.message}`)
})
if (!res?.ok()) throw new Error(`${SOURCE} answered ${res?.status()}`)

await page.addStyleTag({ content: CARD_CSS })
await page.evaluate(() => document.fonts.ready)

const eyebrow = await page.locator('#top > main > :first-child p').first().innerText()

await page.screenshot({ path: OUT + 'card.png', clip: { x: 0, y: 0, width: W, height: H } })
await browser.close()
console.log(`✓ public/og/card.png  ${W}x${H}  (eyebrow: "${eyebrow}")`)
