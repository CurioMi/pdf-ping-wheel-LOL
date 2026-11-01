import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { readPingPayload } from '../src/pdf-io.js'
import { PROFILE_KEY } from '../src/progression.js'

export async function exerciseQuestions(browser, url, out) {
  const context = await browser.newContext({ viewport: { width: 1360, height: 940 }, acceptDownloads: true })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const paper = await PDFDocument.create()
  const font = await paper.embedFont(StandardFonts.Helvetica)
  const bold = await paper.embedFont(StandardFonts.HelveticaBold)
  for (const heading of ['Study design', 'Methods and normalization', 'Results']) {
    const sheet = paper.addPage([612, 792])
    sheet.drawText(heading, { x: 48, y: 710, size: 23, font: bold })
    for (const [i, line] of [
      'Two sensors recorded observations in different units. The signals',
      'were normalized before the measurements were compared.',
      'A baseline was recorded for each sensor. We then evaluated the',
      'difference between the original scale and the normalized scale.',
    ].entries()) sheet.drawText(line, { x: 48, y: 640 - i * 25, size: 13, font, color: rgb(.14, .18, .2) })
  }
  const input = join(out, 'question-reading-fixture.pdf'), exported = join(out, 'question-with-notes.pdf')
  await writeFile(input, await paper.save())
  const note = '为什么要对两个传感器的读数归一化？', answer = '两者的量纲不同，直接比较数值会误判差异。'
  async function load(path, decision) {
    const confirmation = decision ? page.waitForEvent('dialog', { timeout: 10000 }).then(dialog => decision === 'keep' ? dialog.dismiss() : dialog.accept()) : Promise.resolve()
    await Promise.all([confirmation, page.setInputFiles('#file', path)])
    if (decision !== 'keep') await page.waitForFunction(name => document.getElementById('status').textContent.includes(`已打开 ${name}`), path.split('/').at(-1))
  }
  async function save() {
    const downloading = page.waitForEvent('download')
    await page.click('#save'); await (await downloading).saveAs(exported)
    await page.waitForFunction(() => !document.getElementById('save').disabled)
  }
  const question = page.locator('.stamp[data-type="question"]')
  try {
    await page.goto(url); await load(input)
    const second = page.locator('.page-wrap').nth(1)
    await second.scrollIntoViewIfNeeded()
    const target = await second.boundingBox()
    const x = target.x + 60, y = target.y + (792 - 639) * 1.5
    await page.mouse.move(x, y); await page.keyboard.down('Alt')
    await page.mouse.move(x - 102, y - 42, { steps: 8 }); await page.keyboard.up('Alt')
    await question.waitFor()
    const points = () => question.evaluate(el => parseFloat(el.style.width) / (parseInt(document.getElementById('zoom-label').textContent) / 100))
    assert.equal(await points(), 18)
    assert(!await page.locator('#question-panel').isVisible())
    await question.click(); await page.locator('#question-note').waitFor()
    await page.fill('#question-note', note); await page.fill('#question-answer', answer)
    await page.click('#question-close')
    const beforeDrag = await question.getAttribute('data-x')
    const q = await question.boundingBox()
    await page.mouse.move(q.x + q.width / 2, q.y + q.height / 2); await page.mouse.down()
    await page.mouse.move(q.x + q.width / 2 + 34, q.y + q.height / 2 + 39, { steps: 6 }); await page.mouse.up()
    assert.notEqual(await question.getAttribute('data-x'), beforeDrag)
    assert(!await page.locator('#question-panel').isVisible())
    await page.keyboard.press('Control+z'); assert.equal(await question.getAttribute('data-x'), beforeDrag)
    await question.click(); assert.equal(await page.inputValue('#question-note'), note)
    await page.click('[data-marker-size="large"]'); assert.equal(await points(), 36)
    await page.click('[data-marker-size="medium"]'); assert.equal(await points(), 27)
    await page.click('[data-marker-size="small"]'); assert.equal(await points(), 18)
    const originalWidth = await question.evaluate(el => parseFloat(el.style.width))
    await page.click('#zoom-in')
    await page.waitForFunction(() => document.getElementById('zoom-label').textContent === '173%')
    const zoomedWidth = await question.evaluate(el => parseFloat(el.style.width))
    assert(Math.abs(zoomedWidth - originalWidth * 1.15) < 0.1)
    assert.equal(await page.inputValue('#question-answer'), answer)
    await page.click('#zoom-out')
    await page.waitForFunction(() => document.getElementById('zoom-label').textContent === '150%')
    await page.click('#question-locate')
    const stage = await page.locator('#stage').boundingBox(), panel = await page.locator('#question-panel').boundingBox()
    assert(stage.x + stage.width <= panel.x + 1, 'the open question must not cover the PDF')
    await page.screenshot({ path: join(out, 'question-sidebar.png'), animations: 'disabled' })
    await page.click('#question-close')

    // An unsent chat draft survives the loot window, a cancelled file switch and a reload of its own PDF.
    const originalDraft = '准备核对相同的量纲。'
    await page.click('#chat-toggle'); await page.fill('#chat-input', originalDraft)
    await page.click('#loot-open'); await page.click('#loot-close'); await page.locator('#chat-input').waitFor()
    assert.equal(await page.inputValue('#chat-input'), originalDraft)
    await page.keyboard.press('Escape')
    const other = join(out, 'reading-fixture.pdf')
    await load(other, 'keep'); assert.equal(await page.textContent('#file-name'), 'question-reading-fixture.pdf')
    await load(other, 'switch'); assert.equal(await page.locator('.stamp').count(), 0)
    await load(input)
    await question.waitFor()
    assert(await page.locator('#stage').evaluate(el => el.scrollTop > 550), 'last reading page should be restored')
    await page.click('#chat-toggle'); assert.equal(await page.inputValue('#chat-input'), originalDraft)
    await page.click('#chat-cancel')
    await page.click('#question-toggle'); assert.equal(await page.inputValue('#question-answer'), answer)
    await page.click('#question-resolve'); await save()
    const payload = readPingPayload(await PDFDocument.load(await readFile(exported)))
    assert.equal(payload.pings.length, 1)
    const [saved] = payload.pings
    assert.deepEqual([saved.type, saved.page, saved.width, saved.height, saved.questionNote, saved.answer, saved.resolved], ['question', 1, 18, 18, note, answer, true])
    const xp = () => page.evaluate(key => JSON.parse(localStorage.getItem(key))?.xp, PROFILE_KEY)
    assert.equal(await xp(), 25)
    await save(); assert.equal(await xp(), 25)
    await load(exported); assert(!await page.locator('#question-panel').isVisible())
    await question.focus(); await page.keyboard.press('Enter')
    assert.equal(await page.inputValue('#question-note'), note)
    assert.equal(await page.textContent('#question-resolve'), '重新打开疑问')
    await page.click('#question-resolve'); await page.click('#question-resolve'); await save()
    assert.equal(await xp(), 25)
    await page.setViewportSize({ width: 430, height: 850 })
    const narrowStage = await page.locator('#stage').boundingBox(), narrowPanel = await page.locator('#question-panel').boundingBox()
    assert(narrowStage.y + narrowStage.height <= narrowPanel.y + 1)
    assert.deepEqual(errors, [])
    console.log('PASS question UI: native wheel, expand/collapse, drag and undo, all sizes, safe switching, draft and page recovery, portable PDF, daily reward, narrow layout.')
  } finally { await context.close() }
}
