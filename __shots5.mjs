import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const BASE = 'http://localhost:3111'
const OUT = process.argv[2]
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3 })
const page = await ctx.newPage()
const settle = (ms = 700) => page.waitForTimeout(ms)
const go = async (p) => { await page.goto(`${BASE}${p}`, { waitUntil: 'domcontentloaded' }); await settle(1100) }

await go('/access-code')
if (page.url().includes('access-code')) {
  await page.locator('input').first().fill('DP-RECOMP-01')
  await page.screenshot({ path: `${OUT}/light-cta-page.png` })
  await page.getByRole('button', { name: /continue/i }).click()
  await settle(1300)
}
if (page.url().includes('about-you')) {
  await page.getByLabel('Display name').fill('Ada')
  await page.getByLabel('Age').fill('31')
  await page.getByRole('button', { name: 'Female', exact: true }).click()
  await page.getByRole('button', { name: /continue/i }).last().click()
  await settle(800)
  await page.getByLabel('Weight (kg)').fill('63')
  await page.getByLabel('Height (cm)').fill('164')
  await page.getByRole('button', { name: /continue/i }).last().click()
  await settle(800)
  await page.locator('.dropdown').click()
  await settle()
  await page.locator('[data-sheet-panel] button').first().click()
  await settle()
  await page.locator('.goals button').first().click()
  await page.getByRole('button', { name: /continue/i }).last().click()
  await settle(800)
  await page.locator('.slots .slot').first().click()
  await page.getByRole('button', { name: /save & enter/i }).last().click()
  await settle(1600)
}

const setTheme = async (t) =>
  page.evaluate((theme) => {
    localStorage.setItem('dpfit:theme', theme)
    document.documentElement.setAttribute('data-theme', theme)
  }, t)

const el = async (name, path, sel) => {
  await go(path)
  const node = page.locator(sel).first()
  if (!(await node.count())) return console.log('MISSING', name, sel, page.url())
  await node.scrollIntoViewIfNeeded()
  await settle(400)
  const box = await node.boundingBox()
  await page.screenshot({
    path: `${OUT}/${name}.png`,
    clip: { x: Math.max(0, box.x - 20), y: Math.max(0, box.y - 20), width: Math.min(430, box.width + 40), height: box.height + 40 },
  })
  console.log('shot', name)
}

for (const theme of ['light', 'dark']) {
  await setTheme(theme)
  await el(`${theme}-segmented`, '/progress', 'main .bg-fill-subtle.rounded-pill')
  await el(`${theme}-guides`, '/guides', '.guides__filters')
  await el(`${theme}-cta`, '/home', '.btn-raised')
  await el(`${theme}-unit`, '/train/day-1', '[aria-label="Weight unit"]')
  await go('/profile')
  await setTheme(theme)
  const so = page.getByRole('button', { name: /sign out/i }).first()
  await so.scrollIntoViewIfNeeded()
  await so.click()
  await settle(900)
  await page.screenshot({ path: `${OUT}/${theme}-sheet.png`, clip: { x: 0, y: 620, width: 430, height: 312 } })
}
await browser.close()
console.log('done')
