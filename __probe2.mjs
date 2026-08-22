import { chromium } from 'playwright-core'
const BASE = 'http://127.0.0.1:3000'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message.split('\n')[0]))
page.on('crash', () => console.log('*** CRASH EVENT ***'))

const heap = async () => {
  try {
    const h = await page.evaluate(() => performance.memory?.usedJSHeapSize ?? 0)
    return (h / 1048576).toFixed(1) + 'MB'
  } catch { return 'n/a' }
}

await page.goto(BASE + '/access-code', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1200)
await page.locator('input').first().fill('DP-RECOMP-01')
await page.getByRole('button', { name: 'Continue' }).click()
await page.waitForTimeout(1000)
console.log('at', page.url(), await heap())

for (let i = 0; i < 12; i++) {
  if (page.url().includes('/home')) { console.log('reached home'); break }
  const url = page.url()
  const name = page.locator('input[type="text"], input:not([type])').first()
  if (await name.count()) {
    const v = await name.inputValue().catch(() => 'x')
    if (!v) { await name.fill('Ada'); console.log(`  [${i}] filled name`) }
  }
  const opt = page.locator('button, [role="button"]').filter({ hasText: /balanced recomp|moderately active/i }).first()
  if (await opt.count()) { await opt.click().catch(() => {}); console.log(`  [${i}] clicked option`) }

  const nextAll = page.locator('button:visible').filter({ hasText: /next|continue|finish|done|skip/i })
  const n = await nextAll.count()
  const labels = await nextAll.allInnerTexts().catch(() => [])
  console.log(`  [${i}] url=${url.replace(BASE,'')} buttons(${n})=${JSON.stringify(labels)} heap=${await heap()}`)
  if (!n) { console.log('  no next button, stopping'); break }
  await nextAll.last().click().catch((e) => console.log('  click err', e.message.split('\n')[0]))
  await page.waitForTimeout(500)
}
console.log('final url', page.url(), await heap())
await browser.close()
