import { clickReaderTool } from './reader-tools-ui.mjs'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { PROFILE_KEY, newProfile } from '../src/progression.js'

export async function exerciseTrail(browser, url, out) {
  const context = await browser.newContext({ timezoneId: 'Asia/Shanghai', viewport: { width: 1360, height: 940 } })
  const page = await context.newPage(), errors = []
  page.on('pageerror', error => errors.push(error.message))
  const start = new Date('2026-11-01T09:00:00Z')
  // Simulate an existing v1.6 profile without a separate trail or focus-session field.
  const old = newProfile(); old.totalMs = 46 * 60000
  old.reviewReceipts = ['previous-paper:one', 'previous-paper:two', 'previous-paper:three']
  old.days['2026-11-01'] = { ms: 6 * 60000, pages: [], notes: 0, reviews: 0, claimed: [] }
  await page.addInitScript(({ key, profile }) => {
    if (location.protocol === 'http:' && !localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(profile))
  }, { key: PROFILE_KEY, profile: old })
  await page.clock.install({ time: start })
  const profile = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), PROFILE_KEY)
  const click = selector => page.locator(selector).click({ force: true })
  async function advance(ms) {
    await page.clock.runFor(ms)
    // Profile writes are serialized through Web Locks, independently of the test clock.
    let previous = -1, stable = 0
    for (let i = 0; i < 100 && stable < 3; i++) {
      const total = (await profile()).totalMs
      stable = total === previous ? stable + 1 : 0; previous = total
      await new Promise(resolve => setTimeout(resolve, 15))
    }
  }
  try {
    await page.goto(url)
    assert(await page.locator('#quiet-reading').isDisabled())
    await page.setInputFiles('#file', join(out, 'reading-fixture.pdf'))
    await page.waitForFunction(() => document.getElementById('status').textContent.includes('已打开'))
    await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now()) + 1500))
    await advance(180000)
    const idle = (await profile()).totalMs
    assert(idle > old.totalMs + 100000 && idle <= old.totalMs + 121000, 'ordinary reading must stop at the idle threshold')
    await advance(20000); assert.equal((await profile()).totalMs, idle)

    await clickReaderTool(page, '#quiet-reading', { force: true })
    await advance(135000)
    const during = await profile()
    assert(during.totalMs - idle > 130000, 'quiet reading must continue beyond two minutes without input')
    assert((await page.textContent('#reading-progress')).includes('杉木坡'))
    assert.equal(during.xp, 50); assert.equal(during.essence, 350)
    assert(await page.locator('#loot-open.has-rewards').count()); assert(!await page.locator('#loot-toast').isVisible())
    await page.screenshot({ path: join(out, 'quiet-reading.png'), animations: 'disabled' })

    await click('#reading-quests')
    await advance(10)
    const pausedAt = (await profile()).totalMs
    await advance(60000); assert.equal((await profile()).totalMs, pausedAt)
    assert.equal(await page.locator('#trail-card [data-insight-star]').count(), 3)
    assert.equal(await page.locator('#trail-card [data-trail-state="已点亮"]').count(), 1)
    await click('#trail-card [aria-label="查看上一程"]')
    assert.equal(await page.locator('#trail-card [data-trail-state="已点亮"]').count(), 4)
    assert((await page.textContent('#trail-card h2')).includes('萤溪谷'))
    await page.screenshot({ path: join(out, 'trail-map.png'), animations: 'disabled' })
    await click('.trail-journal summary'); assert.equal(await page.locator('.trail-journal li').count(), 4)
    await click('#trail-card [aria-label="查看下一程"]'); assert((await page.textContent('#trail-card h2')).includes('薄雾山径'))
    await page.setViewportSize({ width: 390, height: 844 })
    assert(await page.locator('#trail-card').evaluate(el => el.getBoundingClientRect().right <= innerWidth))
    await page.screenshot({ path: join(out, 'trail-mobile.png'), animations: 'disabled' })
    await page.setViewportSize({ width: 1360, height: 940 }); await click('#loot-close')

    // Simulate a hidden reader while the user consults an external reference.
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')) })
    await advance(10)
    const hiddenAt = (await profile()).totalMs
    await advance(60000); assert.equal((await profile()).totalMs, hiddenAt)
    await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')) })
    await advance(660000)
    const finished = await profile()
    assert(Math.abs(finished.totalMs - idle - 600000) <= 200, 'overlapping ordinary/quiet rules must credit exactly one capped session')
    assert.equal(await page.locator('#quiet-reading').getAttribute('aria-pressed'), 'false')
    await advance(30000); assert.equal((await profile()).totalMs, finished.totalMs)
    assert.equal(finished.xp, 50)

    // Cancelling or replacing the document ends a quiet session without erasing its earned distance.
    await clickReaderTool(page, '#quiet-reading', { force: true }); await advance(15000); await clickReaderTool(page, '#quiet-reading', { force: true })
    assert.equal(await page.locator('#quiet-reading').getAttribute('aria-pressed'), 'false')
    await clickReaderTool(page, '#quiet-reading', { force: true }); const beforeSwitch = (await profile()).totalMs
    await page.clock.resume()
    await page.setInputFiles('#file', join(out, 'question-with-notes.pdf'))
    await page.waitForFunction(() => document.getElementById('status').textContent.includes('已打开 question-with-notes.pdf'), null, { polling: 50 })
    assert.equal(await page.locator('#quiet-reading').getAttribute('aria-pressed'), 'false')
    assert((await profile()).totalMs >= beforeSwitch)
    await page.reload(); await click('#reading-quests')
    assert((await page.textContent('.trail-total')).includes('5'))
    assert.deepEqual(errors, [])
    console.log('PASS trail UI: automatic progress, old profile, ordinary idle, quiet limit, visibility and loot pauses, reward indicator, history, narrow layout and persistence.')
  } finally { await context.close() }
}
