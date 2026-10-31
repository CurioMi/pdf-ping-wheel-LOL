import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join, dirname, extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { ALL_EMOTES, EMOTES } from '../src/pings.js'
import { readPingPayload, readDocumentId } from '../src/pdf-io.js'
import { PROFILE_KEY } from '../src/progression.js'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'work', 'qa')
await mkdir(out, { recursive: true })
const fixture = await PDFDocument.create()
const font = await fixture.embedFont(StandardFonts.Helvetica)
for (let i = 0; i < 3; i++) {
  const page = fixture.addPage([612, 792])
  page.drawText(`Research field notes - Page ${i + 1}`, { x: 55, y: 720, size: 21, font })
  page.drawText('Reading, reflection, and evidence.', { x: 55, y: 680, size: 13, font })
}
const fixturePath = join(out, 'reading-fixture.pdf')
await writeFile(fixturePath, await fixture.save())
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
  const file = resolve(root, 'dist', `.${path === '/' ? '/viewer.html' : path}`)
  if (!file.startsWith(join(root, 'dist') + '/')) { res.writeHead(403).end(); return }
  try {
    const body = await readFile(file)
    res.setHeader('Content-Type', { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.wav': 'audio/wav' }[extname(file)] || 'application/octet-stream')
    res.end(body)
  } catch { res.writeHead(404).end() }
})
await new Promise(r => server.listen(0, '127.0.0.1', r))
const url = `http://127.0.0.1:${server.address().port}/viewer.html`
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_BIN ? { executablePath: process.env.BROWSER_BIN } : {}) })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true })
const page = await context.newPage()
const errors = [], external = []
page.on('pageerror', error => errors.push(error.message))
page.on('request', request => { if (/^https?:/.test(request.url()) && !request.url().startsWith('http://127.0.0.1:')) external.push(request.url()) })
const profile = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), PROFILE_KEY)
const waitForProfile = predicate => page.waitForFunction(({ key, source }) => {
  const p = JSON.parse(localStorage.getItem(key)); return p && new Function('p', `return (${source})(p)`)(p)
}, { key: PROFILE_KEY, source: predicate.toString() })
const extra = ALL_EMOTES.find(e => !EMOTES.some(s => s.id === e.id))
try {
  await page.goto(url)
  await page.waitForFunction(() => document.getElementById('asset-status').textContent.includes('2423/2423'))
  await page.click('#loot-open')
  assert.equal(await page.locator('.loadout-slot').count(), 9)
  await page.screenshot({ path: join(out, 'collection.png'), animations: 'disabled' })
  await page.fill('#emote-search', String(extra.riotId))
  await page.click(`[data-emote="${extra.id}"]`)
  await page.click('[data-action="unlock"]')
  await waitForProfile(p => p.essence === 200)
  assert.equal((await profile()).wheel[0], extra.id)
  // Moving an equipped emote swaps positions, and survives page reload.
  await page.click('[data-slot="2"]'); await page.click('[data-action="equip"]')
  await page.waitForFunction(({ key, id }) => JSON.parse(localStorage.getItem(key)).wheel[2] === id, { key: PROFILE_KEY, id: extra.id })
  await page.reload(); await page.click('#loot-open')
  assert.equal((await profile()).wheel[2], extra.id)
  await page.click('[data-tab="workshop"]'); await page.click('#open-chest')
  await waitForProfile(p => p.pending.length === 3)
  const pending = (await profile()).pending
  await page.screenshot({ path: join(out, 'chest.png'), animations: 'disabled' })
  await page.reload(); await page.click('#loot-open'); await page.click('[data-tab="workshop"]')
  assert.deepEqual((await profile()).pending, pending)
  await page.click(`[data-reward="${pending[0]}"]`)
  await waitForProfile(p => p.pending.length === 0 && p.owned.length === 11)
  // Free mode is reversible and does not grant permanent unlocks.
  await page.check('#free-mode')
  await waitForProfile(p => p.mode === 'free')
  const locked = ALL_EMOTES.find(e => ![...EMOTES.map(x => x.id), extra.id, pending[0]].includes(e.id))
  await page.fill('#emote-search', String(locked.riotId))
  await page.click(`[data-emote="${locked.id}"]`); await page.click('[data-slot="0"]'); await page.click('[data-action="equip"]')
  await page.waitForFunction(({ key, id }) => JSON.parse(localStorage.getItem(key)).wheel[0] === id, { key: PROFILE_KEY, id: locked.id })
  await page.uncheck('#free-mode'); await waitForProfile(p => p.mode === 'quest')
  assert(!(await profile()).wheel.includes(locked.id))
  await page.fill('#emote-search', String(extra.riotId)); await page.click(`[data-emote="${extra.id}"]`)
  await page.locator(`[data-emote="${extra.id}"]`).dragTo(page.locator('[data-slot="0"]'))
  await page.waitForFunction(({ key, id }) => JSON.parse(localStorage.getItem(key)).wheel[0] === id, { key: PROFILE_KEY, id: extra.id })
  // Modal must swallow reader shortcuts, and have no horizontal overflow.
  await page.fill('#emote-search', 'tg'); await page.keyboard.press('t')
  assert.equal(await page.locator('#wheel').isVisible(), false)
  assert(await page.locator('#loot').evaluate(el => el.scrollWidth <= el.clientWidth))
  await page.click('#loot-close')
  await page.setInputFiles('#file', fixturePath)
  await page.waitForFunction(() => document.querySelectorAll('.page-wrap').length === 3 && document.getElementById('status').textContent.includes('已打开'))
  const wrap = page.locator('.page-wrap').first()
  await wrap.scrollIntoViewIfNeeded(); const bounds = await wrap.boundingBox()
  await page.mouse.click(bounds.x + 230, bounds.y + 290)
  await waitForProfile(p => p.totalMs > 0)
  await page.keyboard.press('t')
  await page.waitForSelector(`.stamp[data-type="${extra.id}"]`)
  for (let i = 0; i < 3; i++) {
    const sheet = page.locator('.page-wrap').nth(i)
    await sheet.scrollIntoViewIfNeeded(); const b = await sheet.boundingBox()
    await page.mouse.click(b.x + 170, b.y + 230)
    await page.keyboard.press('Enter')
    await page.fill('#chat-input', ['这里需要检查实验样本数量和对照组是否一致', '模型预测的结果还需要使用独立数据进行验证', '论文结论应该结合误差分析和实际条件进行讨论'][i])
    await page.keyboard.press('Enter')
  }
  assert.equal(await page.locator('.note-stamp').count(), 3)
  const downloadPromise = page.waitForEvent('download'); await page.click('#save')
  const download = await downloadPromise; const savedPath = join(out, 'annotated.pdf')
  await download.saveAs(savedPath)
  await waitForProfile(p => p.noteHashes.length === 3 && p.xp === 150)
  const earned = (await profile()).essence
  const againDownload = page.waitForEvent('download'); await page.click('#save'); await againDownload
  await page.waitForFunction(() => !document.getElementById('save').disabled)
  assert.equal((await profile()).essence, earned)
  const doc = await PDFDocument.load(await readFile(savedPath))
  const payload = readPingPayload(doc)
  assert.equal(payload.pings.length, 4)
  assert(payload.pings.some(p => p.type === extra.id && p.assetData?.length > 100))
  assert.match(readDocumentId(doc), /^[a-f0-9]{64}$/)
  await page.click('#loot-open'); await page.click('[data-tab="quests"]')
  assert.equal(await page.locator('.quest-card.is-complete').count(), 2)
  await page.screenshot({ path: join(out, 'quests.png'), animations: 'disabled' })
  // Reading time must not accumulate while shopping for emotes.
  const timeBefore = (await profile()).totalMs
  await page.waitForTimeout(6000)
  assert.equal((await profile()).totalMs, timeBefore)
  // Keyboard focus stays inside the modal.
  for (let i = 0; i < 12; i++) await page.keyboard.press('Tab')
  assert(await page.evaluate(() => document.getElementById('loot').contains(document.activeElement)))
  const backupDownload = page.waitForEvent('download'); await page.click('#export-profile')
  const backup = await backupDownload, backupPath = join(out, 'profile-backup.json')
  await backup.saveAs(backupPath)
  const backupData = JSON.parse(await readFile(backupPath, 'utf8'))
  assert.equal(backupData.essence, earned)
  page.once('dialog', dialog => dialog.accept())
  await page.setInputFiles('#profile-file', backupPath)
  await page.waitForFunction(() => document.getElementById('loot-toast').textContent === '存档已导入')
  assert.deepEqual((await profile()).wheel, backupData.wheel)
  // Importing somebody else's PDF restores images even with no local asset pack, but grants no note rewards.
  const other = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true })
  const imported = await other.newPage()
  imported.on('pageerror', error => errors.push(error.message))
  await imported.route('**/riot/**', route => route.fulfill({ status: 404, body: 'not installed' }))
  await imported.goto(url)
  await imported.setInputFiles('#file', savedPath)
  await imported.waitForSelector(`.stamp[data-type="${extra.id}"] img[src^="data:"]`)
  assert.equal(await imported.locator('.note-stamp').count(), 3)
  const importedSave = imported.waitForEvent('download'); await imported.click('#save'); await importedSave
  await imported.waitForFunction(() => !document.getElementById('save').disabled)
  const otherProfile = await imported.evaluate(key => JSON.parse(localStorage.getItem(key)), PROFILE_KEY)
  assert.equal(otherProfile?.noteHashes.length || 0, 0)
  await other.close()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: join(out, 'mobile.png'), animations: 'disabled' })
  assert(await page.locator('#loot').evaluate(el => el.scrollWidth <= el.clientWidth))
  assert.deepEqual(errors, []); assert.deepEqual(external, [])
  console.log('PASS UI: search, unlock, equip, swap, drag, persistence, chests, free mode, PDF emote/note portability, task deduplication, modal pause, focus, responsive layout and offline network.')
} finally {
  await browser.close()
  await new Promise(r => server.close(r))
}
