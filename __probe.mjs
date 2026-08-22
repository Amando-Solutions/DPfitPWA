import { chromium } from 'playwright-core'
const BASE = 'http://127.0.0.1:3000'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message.split('\n')[0]))
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE:', m.text().slice(0, 200)) })
page.on('crash', () => console.log('CRASH EVENT'))

await page.goto(BASE + '/access-code', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1500)
await page.locator('input').first().fill('DP-RECOMP-01')
const btns = await page.locator('button:visible').allInnerTexts()
console.log('access-code buttons:', JSON.stringify(btns))
await page.locator('button:visible').filter({ hasText: /continue|unlock|enter|start/i }).first().click()
await page.waitForTimeout(1500)
console.log('url after redeem:', page.url())

for (const r of ['/setup/about-you', '/setup/body-metrics', '/setup/activity-goal', '/setup/safety-call']) {
  try {
    await page.goto(BASE + r, { waitUntil: 'domcontentloaded', timeout: 15000 })
    await page.waitForTimeout(800)
    const txt = (await page.locator('body').innerText()).trim().slice(0, 60).replace(/\s+/g, ' ')
    console.log(`${r} -> ${page.url()} | "${txt}"`)
  } catch (e) {
    console.log(`${r} -> ERROR ${e.message.split('\n')[0]}`)
  }
}
await browser.close()
