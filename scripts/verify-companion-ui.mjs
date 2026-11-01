import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { newProfile, PROFILE_KEY } from '../src/progression.js'
import { clickReaderTool } from './reader-tools-ui.mjs'

export async function exerciseCompanions(browser, url, out) {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 940 }, timezoneId: 'Asia/Shanghai', acceptDownloads: true })
  const page = await ctx.newPage(), errors = [], external = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('request', req => { if (/^https?:/.test(req.url()) && new URL(req.url()).origin !== new URL(url).origin) external.push(req.url()) })
  // The remaining seconds before the next form must come from reading through the normal viewer.
  await ctx.addInitScript(({ key, seed }) => {
    if (location.protocol !== 'http:' || localStorage.getItem(key)) return
    const now = new Date()
    const date = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-')
    seed.totalMs = 25 * 60000 - 8000
    seed.days[date] = { ms: 10 * 60000 - 8000, pages: [], notes: 0, reviews: 0, claimed: [] }
    localStorage.setItem(key, JSON.stringify(seed))
  }, { key: PROFILE_KEY, seed: newProfile() })
  const file = { name: '传感器归一化研究.pdf', mimeType: 'application/pdf', buffer: await readFile(join(out, 'question-reading-fixture.pdf')) }
  async function load(target) {
    await target.goto(url); await target.setInputFiles('#file', file)
    await target.waitForFunction(() => document.body.classList.contains('has-document'))
  }
  async function select(target, id) {
    await target.click('#reading-quests')
    await target.selectOption('#companion-choice', id)
    await target.waitForFunction(({ key, id }) => JSON.parse(localStorage.getItem(key)).companion === id, { key: PROFILE_KEY, id })
    await target.click('#loot-close')
  }
  async function save() {
    const download = page.waitForEvent('download')
    await page.click('#save'); await download
    await page.waitForFunction(() => !document.getElementById('save').disabled)
  }
  try {
    await load(page)
    assert.equal(await page.locator('#reading-seals .task-seal').count(), 3)
    await page.waitForSelector('#reading-emblem[data-form="smolder-1"]')
    await page.locator('.page-wrap').first().click({ position: { x: 60, y: 80 } })
    await page.waitForSelector('#reading-emblem[data-form="smolder-2"]', { timeout: 25000 })
    assert.equal(await page.textContent('#reading-layers'), '5 层')
    const seals = page.locator('#reading-seals .task-seal')
    assert.equal(await seals.first().getAttribute('data-status'), 'done')
    assert((await seals.first().getAttribute('title')).includes('10/10'))
    await select(page, 'sol')
    assert.equal(await page.textContent('#reading-layers'), '2 层')
    for (let i = 0; i < 3; i++) {
      await page.locator('.page-wrap').nth(i).evaluate(el => el.scrollIntoView({ block: 'center' }))
      await clickReaderTool(page, '#mastery')
    }
    await save()
    await page.waitForFunction(() => document.getElementById('reading-layers').textContent === '5 层')
    assert.equal(await seals.nth(1).getAttribute('data-status'), 'done')
    await save()
    assert.equal(await page.textContent('#reading-layers'), '5 层')
    await select(page, 'harvest')
    assert.equal(await page.textContent('#reading-layers'), '0 层')
    const sheet = page.locator('.page-wrap').first()
    await sheet.evaluate(el => el.scrollIntoView({ block: 'start' }))
    const rect = await sheet.boundingBox(), x = rect.x + 180, y = rect.y + 180
    await page.mouse.move(x, y); await page.keyboard.down('Alt')
    await page.mouse.move(x - 102, y - 42, { steps: 8 }); await page.keyboard.up('Alt')
    await page.locator('.stamp[data-type="question"]').click()
    await page.fill('#question-note', '不同量纲下可以直接比较吗？')
    await page.fill('#question-answer', '回读方法后，我会先核对基线和单位。')
    await page.click('#question-resolve'); await page.click('#question-close')
    await save()
    await page.waitForSelector('#reading-emblem[data-form="harvest-1"]')
    assert.equal(await seals.last().getAttribute('data-status'), 'done')
    await save(); assert.equal(await page.textContent('#reading-layers'), '1 层')

    const other = await ctx.newPage(); await load(other)
    assert.equal(await other.textContent('#reading-layers'), '1 层')
    await select(other, 'smolder')
    await page.waitForSelector('#reading-emblem[data-form="smolder-2"]')
    await other.close(); await page.bringToFront()
    await sheet.evaluate(el => el.scrollIntoView({ block: 'start' }))
    await page.screenshot({ path: join(out, 'companions-reader.png') })
    await page.click('#reading-quests')
    assert.equal(await page.inputValue('#companion-choice'), 'smolder')
    assert((await page.textContent('#companion-detail')).includes('展翼'))
    assert.equal(await page.locator('.companion-forms li').count(), 4)
    assert((await page.textContent('.companion-forms [aria-current]')).includes('展翼'))
    await page.locator('#companion-card').screenshot({ path: join(out, 'companions-card.png') })
    await page.locator('#companion-choice').focus()
    for (const id of ['sol','harvest','lantern']) {
      await page.selectOption('#companion-choice', id)
      await page.waitForSelector(`.companion-display[data-track="${id}"]`)
      assert.equal(await page.evaluate(() => document.activeElement.id), 'companion-choice')
    }
    const exporting = page.waitForEvent('download'); await page.click('#export-profile')
    const backup = JSON.parse(await readFile(await (await exporting).path(), 'utf8'))
    assert.equal(backup.companion, 'lantern')
    delete backup.companion
    page.once('dialog', dialog => dialog.accept())
    await page.setInputFiles('#profile-file', { name: '旧存档.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) })
    await page.waitForFunction(() => document.getElementById('loot-toast').textContent === '存档已导入')
    await page.click('#loot-close')
    assert.equal(await page.locator('#reading-emblem').getAttribute('data-form'), 'lantern')
    assert(await page.locator('#reading-layers').isHidden())
    await select(page, 'harvest'); assert.equal(await page.textContent('#reading-layers'), '1 层')
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 })
      await page.waitForFunction(() => {
        const stage = document.getElementById('stage')
        return document.querySelectorAll('.page-wrap').length === 3 && stage.scrollWidth <= stage.clientWidth + 1
      })
      assert.equal(await page.locator('.bar button:visible').count(), 5)
      assert(await page.evaluate(() => document.documentElement.scrollWidth === innerWidth &&
        document.getElementById('reading-seals').getBoundingClientRect().right <= innerWidth))
      assert(await page.locator('#stage').evaluate(el => el.getBoundingClientRect().top < 90))
      if (width === 390) {
        await page.locator('#loot-toast').waitFor({ state: 'hidden' })
        await page.locator('#stage').evaluate(el => { el.scrollTop = 0 })
        await page.screenshot({ path: join(out, 'companions-narrow.png') })
      }
      await page.click('#reading-quests')
      assert(await page.locator('#companion-card').evaluate(el => el.scrollWidth <= el.clientWidth + 1 && el.getBoundingClientRect().right <= innerWidth))
      await page.click('#loot-close')
    }
    assert.deepEqual(errors, []); assert.deepEqual(external, [])
    console.log('PASS companions: live growth, saved pages and resolved questions, daily seals, duplicate saves, four choices, tab sync, backup migration, offline and narrow layouts.')
  } finally { await ctx.close() }
}
