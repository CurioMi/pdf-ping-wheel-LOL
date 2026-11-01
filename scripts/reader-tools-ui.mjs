import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { PDFDocument } from 'pdf-lib'

export async function clickReaderTool(page, selector, options) {
  if (!await page.locator('#reader-tools').isVisible()) await page.click('#tools-toggle', options)
  await page.click(selector, options)
}

export async function exerciseReaderTools(browser, url, out) {
  const context = await browser.newContext({ viewport: { width: 1360, height: 940 } })
  const page = await context.newPage(), errors = []
  page.on('pageerror', error => errors.push(error.message))
  try {
    await page.goto(url)
    assert(await page.locator('#open-empty').isVisible())
    assert(!await page.locator('#open').isVisible())
    assert(!await page.locator('#legend').isVisible())
    await page.setInputFiles('#file', { name: 'bad.pdf', mimeType: 'application/pdf', buffer: Buffer.from('bad') })
    await page.waitForFunction(() => document.getElementById('status').textContent.includes('打不开'))
    assert(!await page.locator('#status').evaluate(el => el.classList.contains('sr-only')))
    const filename = '关于两组传感器读数与基线误差的比较研究'.repeat(6) + '.pdf'
    await page.setInputFiles('#file', { name: filename, mimeType: 'application/pdf', buffer: await readFile(join(out, 'reading-fixture.pdf')) })
    await page.waitForFunction(() => document.body.classList.contains('has-document'))
    assert.equal(await page.locator('#file-name').getAttribute('title'), filename)
    for (const width of [1360, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 844 })
      await page.waitForFunction(() => {
        const stage = document.getElementById('stage')
        return document.querySelectorAll('.page-wrap').length === 3 && stage.scrollWidth <= stage.clientWidth + 1
      })
      assert.equal(await page.locator('.bar button:visible').count(), 5)
      const geom = await page.locator('#stage').evaluate(el => ({ top: el.getBoundingClientRect().top, overflow: document.documentElement.scrollWidth - innerWidth }))
      assert(geom.top <= (width <= 640 ? 90 : 60), JSON.stringify({ width, geom }))
      assert.equal(geom.overflow, 0, JSON.stringify({ width, geom }))
      await page.click('#tools-toggle')
      const menu = page.locator('#reader-tools')
      const rect = await menu.boundingBox()
      assert(rect && rect.x >= 0 && rect.x + rect.width <= width && rect.y + rect.height <= 844)
      await page.keyboard.press('t'); assert(!await page.locator('#wheel').isVisible())
      await page.keyboard.press('Escape'); assert(!await menu.isVisible())
      assert.equal(await page.evaluate(() => document.activeElement.id), 'tools-toggle')
    }
    await clickReaderTool(page, '#zoom-in')
    await page.waitForFunction(() => Number.parseInt(document.getElementById('zoom-label').textContent) > 44)
    const manual = await page.textContent('#zoom-label')
    await page.keyboard.press('Escape')
    await page.setViewportSize({ width: 1360, height: 940 })
    await page.waitForTimeout(240)
    assert.equal(await page.textContent('#zoom-label'), manual)
    await clickReaderTool(page, '#fit')
    await page.waitForFunction(() => document.getElementById('zoom-label').textContent === '150%')
    await page.keyboard.press('Escape')
    await page.locator('.page-wrap').nth(1).evaluate(el => el.scrollIntoView({ block: 'center' }))
    await page.click('#tools-toggle'); await page.click('#help summary')
    assert(await page.locator('#asset-status').isVisible())
    assert.equal(await page.locator('#legend .legend-item').count(), 9)
    await page.click('#help summary')
    await page.click('#mastery')
    await page.locator('.page-wrap').nth(1).locator('.stamp[data-type="mastery"]').waitFor()
    assert(!await page.locator('#reader-tools').isVisible())
    assert(await page.locator('#save').evaluate(el => el.classList.contains('is-dirty')))
    await clickReaderTool(page, '#chat-toggle')
    await page.fill('#chat-input', '在当前读到的地方记一条。'); await page.press('#chat-input', 'Enter')
    assert.equal(await page.locator('.page-wrap').nth(1).locator('.note-stamp').count(), 1)
    await clickReaderTool(page, '#question-toggle')
    assert.equal(await page.evaluate(() => document.activeElement.id), 'question-close')
    await page.keyboard.press('Escape')
    assert.equal(await page.evaluate(() => document.activeElement.id), 'tools-toggle')
    await clickReaderTool(page, '#loot-open'); await page.click('#loot-close')
    assert.equal(await page.evaluate(() => document.activeElement.id), 'tools-toggle')

    // A wide results table later in the paper should also fit, with the reader staying on it.
    const mixed = await PDFDocument.create()
    for (const size of [[612, 792], [612, 792], [960, 612], [612, 792], [612, 792]]) mixed.addPage(size)
    page.once('dialog', dialog => dialog.accept())
    await page.setInputFiles('#file', { name: '横向表格.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await mixed.save()) })
    await page.waitForFunction(() => document.getElementById('status').textContent.includes('已打开 横向表格.pdf'))
    await page.locator('.page-wrap').nth(2).evaluate(el => el.scrollIntoView({ block: 'center' }))
    await page.setViewportSize({ width: 390, height: 844 })
    await page.waitForFunction(() => {
      const stage = document.getElementById('stage'), wraps = document.querySelectorAll('.page-wrap')
      if (wraps.length !== 5 || stage.scrollWidth > stage.clientWidth + 1) return false
      const rect = wraps[2].getBoundingClientRect(), middle = stage.getBoundingClientRect().top + stage.clientHeight / 2
      return rect.top <= middle && rect.bottom >= middle
    })
    assert.deepEqual(errors, [])
    console.log('PASS compact reader: five visible controls, narrow layout, help, keyboard, contextual placement, focus return and draft notices.')
  } finally { await context.close() }
}
