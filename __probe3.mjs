import { chromium } from 'playwright-core'
const BASE = 'http://127.0.0.1:3000'
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage()
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message.split('\n')[0]))

const go = async (n, fn) => { try { await fn(); console.log('ok  ', n) } catch (e) { console.log('FAIL', n, '::', e.message.split('\n')[0]) } }

await page.goto(BASE + '/access-code', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1000)
await page.locator('input').first().fill('DP-RECOMP-01')
await page.getByRole('button', { name: 'Continue' }).click()
await page.waitForURL('**/setup/about-you', { timeout: 8000 })

await go('fill name', () => page.getByLabel('Display name').fill('Ada'))
await go('fill age', () => page.getByLabel('Age').fill('31'))
await go('pick sex', () => page.getByRole('button', { name: 'Female', exact: true }).click())
await go('continue 1', () => page.getByRole('button', { name: /continue/i }).click({ timeout: 6000 }))
await page.waitForTimeout(600); console.log('   url:', page.url())

await go('fill weight', () => page.getByLabel(/weight/i).fill('63'))
await go('fill height', () => page.getByLabel(/height/i).fill('164'))
await go('continue 2', () => page.getByRole('button', { name: /continue/i }).click({ timeout: 6000 }))
await page.waitForTimeout(600); console.log('   url:', page.url())

await go('goal card', () => page.locator('.goals button, .goals [role="button"]').first().click({ timeout: 6000 }))
await go('open sheet', () => page.locator('button.dropdown').click({ timeout: 6000 }))
await page.waitForTimeout(500)
const sheetCount = await page.locator('.sheet-list button, .sheet-list [role="button"]').count()
console.log('   sheet options:', sheetCount)
await go('pick activity', () => page.locator('.sheet-list button, .sheet-list [role="button"]').nth(1).click({ timeout: 6000 }))
await page.waitForTimeout(500)
await go('continue 3', () => page.getByRole('button', { name: /continue/i }).click({ timeout: 6000 }))
await page.waitForTimeout(700); console.log('   url:', page.url())

const btns = await page.locator('button:visible').allInnerTexts()
console.log('   step4 buttons:', JSON.stringify(btns))
await go('finish', () => page.getByRole('button', { name: /continue|finish|done/i }).last().click({ timeout: 6000 }))
await page.waitForTimeout(1200); console.log('   final url:', page.url())
await browser.close()
