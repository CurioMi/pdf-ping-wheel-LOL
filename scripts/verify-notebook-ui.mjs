import { clickReaderTool } from './reader-tools-ui.mjs'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { PDFDocument } from 'pdf-lib'
import { readNotebook, readPingPayload } from '../src/pdf-io.js'
import { encodePng } from './png.mjs'

export async function exerciseNotebook(browser, url, out) {
  const context = await browser.newContext({ viewport: { width: 1360, height: 940 }, acceptDownloads: true })
  const errors = [], external = []
  const page = await context.newPage()
  page.on('pageerror', error => errors.push(error.message))
  page.on('request', req => { if (/^https?:/.test(req.url()) && !req.url().startsWith(new URL(url).origin + '/')) external.push(req.url()) })
  const paper = join(out, 'question-with-notes.pdf'), saved = join(out, 'notebook-example.pdf')
  const summary = '我想记住的是，比较两个传感器之前，要先弄清楚它们各自在测什么。\n下次读类似的论文，我会先看基线，再看结果图。'
  const first = '再找一组量程不同的传感器，看看这个比较方法还能不能用。'
  const second = '我还没弄清归一化用的是哪一段基线。下次从这页接着读。'
  async function load(target, file, hasDraft = false) {
    if (hasDraft) target.once('dialog', dialog => dialog.accept())
    await target.setInputFiles('#file', file)
    const name = typeof file === 'string' ? basename(file) : file.name
    await target.waitForFunction(n => document.getElementById('status').textContent.includes('已打开 ' + n) && !document.getElementById('notebook-toggle').disabled, name)
  }
  async function centerPage(index) {
    await page.locator('.page-wrap').nth(index).evaluate(wrap => wrap.scrollIntoView({ block: 'center' }))
  }
  const entries = page.locator('#notebook-entries button')
  try {
    await page.goto(url)
    assert(await page.locator('#notebook-toggle').isDisabled())
    await load(page, paper)
    await page.click('#notebook-toggle')
    assert.equal(await page.inputValue('#notebook-summary'), '')
    assert.equal(await entries.count(), 0)
    assert(await page.locator('#notebook-export').isDisabled())
    await page.fill('#notebook-summary', summary)
    await centerPage(0)
    await page.click('#notebook-add'); await page.fill('#notebook-entry', first)
    await centerPage(1)
    await page.click('#notebook-add'); await page.fill('#notebook-entry', second)
    assert.equal(await page.textContent('#notebook-entry-label'), '第 2 页的笔记')
    await page.keyboard.press('t'); await page.keyboard.press('Backspace')
    assert.equal(await page.inputValue('#notebook-entry'), second)
    assert(!(await page.locator('#wheel').isVisible()))
    await page.click('#notebook-done')
    await page.click('#notebook-add'); await page.fill('#notebook-entry', '临时 <img src=x onerror=alert(1)>')
    assert.equal(await page.locator('#notebook-entries img').count(), 0)
    page.once('dialog', dialog => dialog.dismiss()); await page.click('#notebook-delete')
    assert.equal(await entries.count(), 3)
    page.once('dialog', dialog => dialog.accept()); await page.click('#notebook-delete')
    assert.equal(await entries.count(), 2)
    await clickReaderTool(page, '#question-toggle')
    assert(!(await page.locator('#notebook-panel').isVisible()))
    await page.click('#notebook-toggle')
    assert(!(await page.locator('#question-panel').isVisible()))
    assert.equal(await page.inputValue('#notebook-summary'), summary)

    // A differently sourced file with the same filename has its own blank notebook, even without a text layer.
    const scanDoc = await PDFDocument.create()
    const scanImage = await scanDoc.embedPng(encodePng(24, (x, y) => x % 5 && y % 5 ? [234, 239, 243, 255] : [81, 113, 128, 255]))
    scanDoc.addPage([210, 300]).drawImage(scanImage, { x: 15, y: 150, width: 180, height: 120 })
    const scan = { name: basename(paper), mimeType: 'application/pdf', buffer: Buffer.from(await scanDoc.save()) }
    await load(page, scan, true)
    await page.click('#notebook-toggle')
    assert.equal(await page.inputValue('#notebook-summary'), '')
    assert.equal(await entries.count(), 0)
    await page.click('#notebook-add'); await page.fill('#notebook-entry', '扫描页上的图值得再看。')
    page.once('dialog', dialog => dialog.accept())
    await page.reload()
    await load(page, scan)
    await page.click('#notebook-toggle')
    assert.equal(await entries.count(), 1)
    await entries.first().click()
    assert.equal(await page.inputValue('#notebook-entry'), '扫描页上的图值得再看。')
    await load(page, paper, true)
    await page.click('#notebook-toggle')
    assert.equal(await page.inputValue('#notebook-summary'), summary)
    assert.equal(await entries.count(), 2)
    await centerPage(2)
    await entries.nth(1).click()
    assert.equal(await page.inputValue('#notebook-entry'), second)
    const secondInView = () => page.locator('.page-wrap').nth(1).evaluate(wrap => {
      const rect = wrap.getBoundingClientRect(), stage = document.getElementById('stage').getBoundingClientRect()
      const center = stage.top + stage.height / 2
      return rect.top <= center && rect.bottom >= center
    })
    assert(await secondInView())
    await centerPage(2); await page.click('#notebook-locate')
    assert(await secondInView())
    const textDownload = page.waitForEvent('download')
    await page.click('#notebook-export')
    const txt = await textDownload
    assert(txt.suggestedFilename().endsWith('-论文笔记.txt'))
    assert.equal(await readFile(await txt.path(), 'utf8'), basename(paper) + ' · 论文笔记\n\n整篇心得\n' + summary + '\n\n第 1 页\n' + first + '\n\n第 2 页\n' + second + '\n')
    const pdfDownload = page.waitForEvent('download')
    await page.click('#save'); await (await pdfDownload).saveAs(saved)
    await page.waitForFunction(() => !document.getElementById('save').disabled && !document.getElementById('draft-state').textContent)
    const doc = await PDFDocument.load(await readFile(saved)), book = readNotebook(doc)
    assert.equal(book.summary, summary)
    assert.deepEqual(book.entries.map(e => e.page).sort(), [0, 1])
    assert.equal(readPingPayload(doc).pings.length, readPingPayload(await PDFDocument.load(await readFile(paper))).pings.length)
    await page.screenshot({ path: join(out, 'notebook.png') })
    await page.setViewportSize({ width: 390, height: 844 })
    assert(await page.locator('#notebook-panel').evaluate(panel => panel.scrollWidth <= panel.clientWidth && panel.getBoundingClientRect().top >= document.getElementById('stage').getBoundingClientRect().bottom - 1))
    await page.click('#notebook-close')

    const fresh = await browser.newContext({ acceptDownloads: true }), reader = await fresh.newPage()
    try {
      await reader.goto(url); await load(reader, saved); await reader.click('#notebook-toggle')
      assert.equal(await reader.inputValue('#notebook-summary'), summary)
      await reader.locator('#notebook-entries button').last().click()
      assert.equal(await reader.inputValue('#notebook-entry'), second)
      await reader.fill('#notebook-entry', second + '\n回看后补写的一行。')
      await reader.click('#notebook-done'); await reader.locator('#notebook-entries button').first().click()
      reader.once('dialog', dialog => dialog.accept()); await reader.click('#notebook-delete')
      const result = reader.waitForEvent('download')
      await reader.click('#save')
      const revised = readNotebook(await PDFDocument.load(await readFile(await (await result).path())))
      assert.equal(revised.entries.length, 1)
      assert.equal(revised.entries[0].text, second + '\n回看后补写的一行。')
      await reader.waitForFunction(() => !document.getElementById('save').disabled)

      // Hold an in-place PDF write open while the reader edits and deletes notes.
      await reader.evaluate(bytes => {
        window.showOpenFilePicker = async () => [{
          getFile: async () => new File([new Uint8Array(bytes)], '慢速写入.pdf', { type: 'application/pdf' }),
          createWritable: async () => ({
            write: async data => {
              window.testWrittenPdf = Array.from(data)
              await new Promise(resolve => { window.finishTestWrite = resolve })
            },
            close: async () => {},
          }),
        }]
      }, Array.from(scan.buffer))
      await reader.click('#open')
      await reader.waitForFunction(() => document.getElementById('status').textContent.includes('已打开 慢速写入.pdf'))
      await reader.click('#notebook-toggle')
      await reader.fill('#notebook-summary', '保存时的文字')
      await reader.click('#notebook-add'); await reader.fill('#notebook-entry', '保存时的页边笔记')
      await reader.click('#save')
      await reader.waitForFunction(() => typeof window.finishTestWrite === 'function')
      await reader.fill('#notebook-summary', '保存进行时继续写的文字')
      reader.once('dialog', dialog => dialog.accept()); await reader.click('#notebook-delete')
      await reader.evaluate(() => window.finishTestWrite())
      await reader.waitForFunction(() => !document.getElementById('save').disabled)
      const written = Buffer.from(await reader.evaluate(() => window.testWrittenPdf))
      assert.equal(readNotebook(await PDFDocument.load(written)).entries.length, 1)
      assert((await reader.textContent('#draft-state')).includes('待保存'))
      await load(reader, { name: '刚保存的副本.pdf', mimeType: 'application/pdf', buffer: written }, true)
      await reader.click('#notebook-toggle')
      assert.equal(await reader.inputValue('#notebook-summary'), '保存进行时继续写的文字')
      assert.equal(await reader.locator('#notebook-entries button').count(), 0)
      await reader.click('#notebook-close'); await clickReaderTool(reader, '#chat-toggle')
      await reader.fill('#chat-input', '尚未发送的聊天备注')
      await reader.click('#notebook-toggle')
      assert(!(await reader.locator('#chat-composer').isVisible()))
      await reader.click('#notebook-close'); await clickReaderTool(reader, '#chat-toggle')
      assert.equal(await reader.inputValue('#chat-input'), '尚未发送的聊天备注')
    } finally { await fresh.close() }
    assert.deepEqual(errors, []); assert.deepEqual(external, [])
    console.log('PASS notebook UI: blank paper, manual writing, page anchors, image-only PDF, drafts, isolation, TXT, portable PDF, editing, deletion, mobile layout and offline requests.')
  } finally { await context.close() }
}
