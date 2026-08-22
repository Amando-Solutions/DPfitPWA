import { chromium } from 'playwright-core'

const BASE = process.env.BASE ?? 'http://localhost:3210'
const label = process.env.LABEL ?? 'run'

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
const page = await ctx.newPage()

const errors = []
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()}`)
})
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))

const step = async (name, fn) => {
  try {
    await fn()
    console.log(`  ok   ${name}`)
  } catch (e) {
    console.log(`  FAIL ${name}: ${e.message.split('\n')[0]}`)
    errors.push(`${name}: ${e.message.split('\n')[0]}`)
  }
}

await step('splash boots and routes to onboarding', async () => {
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  await page.waitForURL('**/onboarding', { timeout: 8000 })
})

await step('onboarding art renders (optimised SVG decodes)', async () => {
  const img = page.locator('.onb__art-img')
  await img.waitFor({ state: 'visible', timeout: 5000 })
  const ok = await img.evaluate((el) => el.complete && el.naturalWidth > 0)
  if (!ok) throw new Error('illustration failed to decode')
})

await step('walks all three slides', async () => {
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: 'Next' }).click()
    await page.waitForTimeout(350)
    const ok = await page
      .locator('.onb__art-img')
      .evaluate((el) => el.complete && el.naturalWidth > 0)
    if (!ok) throw new Error(`slide ${i + 2} illustration failed to decode`)
  }
  await page.getByRole('button', { name: /access code/i }).click()
  await page.waitForURL('**/access-code', { timeout: 5000 })
})

await step('redeems access code', async () => {
  await page.locator('input').first().fill('DP-RECOMP-01')
  await page.locator('button:visible').filter({ hasText: /continue|unlock|enter|start/i }).first().click()
  await page.waitForURL('**/setup/**', { timeout: 8000 })
})

await step('walks the setup flow to home', async () => {
  // 1 · About you — name, age, sex
  await page.waitForURL('**/setup/about-you', { timeout: 8000 })
  await page.getByLabel('Display name').fill('Ada')
  await page.getByLabel('Age').fill('31')
  await page.getByRole('button', { name: 'Female', exact: true }).click()
  await page.getByRole('button', { name: /continue/i }).click()

  // 2 · Body metrics — weight, height
  await page.waitForURL('**/setup/body-metrics', { timeout: 8000 })
  await page.getByLabel(/weight/i).fill('63')
  await page.getByLabel(/height/i).fill('164')
  await page.getByRole('button', { name: /continue/i }).click()

  // 3 · Activity & goal — pick a goal card, then one activity from the sheet
  await page.waitForURL('**/setup/activity-goal', { timeout: 8000 })
  await page.locator('.goals button, .goals [role="button"]').first().click()
  await page.locator('button.dropdown').click()
  await page.waitForTimeout(450)
  await page.locator('.sheet-list button, .sheet-list [role="button"]').nth(2).click()
  await page.waitForTimeout(450)
  await page.getByRole('button', { name: /continue/i }).click()

  // 4 · Safety call — everything optional
  await page.waitForURL('**/setup/safety-call', { timeout: 8000 })
  await page.getByRole('button', { name: /save & enter app/i }).click()

  await page.waitForURL('**/home', { timeout: 10000 })
})

await step('home renders with content', async () => {
  await page.waitForSelector('text=/./', { timeout: 5000 })
  const text = await page.locator('body').innerText()
  if (text.trim().length < 40) throw new Error('home looks empty')
})

// Walk every tab several times — this is what exercised the per-caller store.
const routes = ['/home', '/chat', '/train', '/nutrition', '/more', '/progress', '/rewards', '/profile']
await step('navigates every tab three times over', async () => {
  for (let pass = 0; pass < 3; pass++) {
    for (const r of routes) {
      await page.goto(BASE + r, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(120)
      const t = await page.locator('body').innerText()
      if (t.trim().length < 20) throw new Error(`${r} rendered empty`)
    }
  }
})

// Settle, force GC, then read the heap.
const cdp = await ctx.newCDPSession(page)
await cdp.send('HeapProfiler.enable')
for (let i = 0; i < 3; i++) {
  await cdp.send('HeapProfiler.collectGarbage')
  await page.waitForTimeout(250)
}
await cdp.send('Performance.enable').catch(() => {})
const metrics = await cdp.send('Performance.getMetrics').catch(() => null)
const heap = await page.evaluate(() => performance.memory?.usedJSHeapSize ?? 0)
const nodes = metrics?.metrics?.find((m) => m.name === 'Nodes')?.value ?? 0
const listeners = metrics?.metrics?.find((m) => m.name === 'JSEventListeners')?.value ?? 0

console.log(`\n[${label}] heap ${(heap / 1048576).toFixed(2)} MB | DOM nodes ${nodes} | listeners ${listeners}`)
console.log(`[${label}] errors: ${errors.length}`)
for (const e of errors.slice(0, 12)) console.log('   -', e)

await browser.close()
process.exit(errors.length ? 1 : 0)
