import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { PDFDocument } from 'pdf-lib'
import { readNotebook } from '../src/pdf-io.js'
import { clickReaderTool } from './reader-tools-ui.mjs'

export async function exerciseSaveProtection(browser, url, out) {
  const raw = await readFile(join(out, 'reading-fixture.pdf'))
  const noteIn = async bytes => readNotebook(await PDFDocument.load(bytes)).summary
  const ctx = await browser.newContext({ acceptDownloads: true })
  try {
    const page = await ctx.newPage(); await page.goto(url)
    const openBytes = async (name, bytes) => {
      await page.setInputFiles('#file', { name, mimeType: 'application/pdf', buffer: bytes })
      await page.waitForFunction(n => document.getElementById('status').textContent.includes('已打开 ' + n), name)
      await page.click('#notebook-toggle')
    }
    await openBytes('原件.pdf', raw)
    await page.fill('#notebook-summary', '取消下载也要留下这段心得')
    await page.click('#notebook-add'); await page.fill('#notebook-entry', '给这一页的手记')
    await page.click('#notebook-close'); await clickReaderTool(page, '#mastery')
    // Swallow the download request while recording the bytes the browser would have received.
    await page.evaluate(() => {
      HTMLAnchorElement.prototype.click = function () {
        window.exportedBytes = fetch(this.href).then(r => r.arrayBuffer()).then(b => Array.from(new Uint8Array(b)))
      }
    })
    await page.click('#save'); await page.waitForFunction(() => !document.getElementById('save').disabled && window.exportedBytes)
    const copy = Buffer.from(await page.evaluate(() => window.exportedBytes))
    await page.reload()
    await openBytes('原件.pdf', raw)
    assert.equal(await page.inputValue('#notebook-summary'), '取消下载也要留下这段心得')
    assert.equal(await page.locator('#notebook-entries button').count(), 1)
    assert.equal(await page.locator('.stamp[data-type="mastery"]').count(), 1)
    assert((await page.textContent('#status')).includes('已恢复上次导出副本的改动'))
    await page.fill('#notebook-summary', '导出之后又补了一句')
    page.once('dialog', d => d.accept()); await openBytes('副本.pdf', copy)
    assert.equal(await page.inputValue('#notebook-summary'), '导出之后又补了一句')
    assert.equal(await page.locator('.stamp[data-type="mastery"]').count(), 1)
  } finally { await ctx.close() }

  const windows = await browser.newContext({ acceptDownloads: true })
  try {
    const left = await windows.newPage(), right = await windows.newPage()
    await left.goto(url); await right.goto(url)
    // Both tabs open the same real file handle in this isolated browser profile.
    await left.evaluate(async bytes => {
      const dir = await navigator.storage.getDirectory()
      const file = await dir.getFileHandle('同一篇论文.pdf', { create: true })
      const writer = await file.createWritable(); await writer.write(new Uint8Array(bytes)); await writer.close()
    }, Array.from(raw))
    for (const tab of [left, right]) {
      await tab.evaluate(() => {
        window.showOpenFilePicker = async () => [(await (await navigator.storage.getDirectory()).getFileHandle('同一篇论文.pdf'))]
      })
      await tab.click('#open-empty')
      await tab.waitForFunction(() => document.body.classList.contains('has-document'))
      await tab.click('#notebook-toggle')
    }
    await left.fill('#notebook-summary', '第一个窗口的改动')
    await left.click('#save'); await left.waitForFunction(() => document.getElementById('status').textContent.includes('已覆盖保存原文件'))
    await left.waitForFunction(() => !document.getElementById('save').disabled)
    await left.fill('#notebook-summary', '第一个窗口的第二次保存')
    await left.click('#save'); await left.waitForFunction(() => !document.getElementById('save').disabled)
    await right.fill('#notebook-summary', '第二个窗口的独立心得')
    const downloading = right.waitForEvent('download'); await right.click('#save')
    const conflict = await downloading
    assert.equal(conflict.suggestedFilename(), '同一篇论文-阅读副本.pdf')
    assert.equal(await noteIn(await readFile(await conflict.path())), '第二个窗口的独立心得')
    const disk = await left.evaluate(async () => {
      const file = await (await navigator.storage.getDirectory()).getFileHandle('同一篇论文.pdf')
      return Array.from(new Uint8Array(await (await file.getFile()).arrayBuffer()))
    })
    assert.equal(await noteIn(Buffer.from(disk)), '第一个窗口的第二次保存')
    assert((await right.textContent('#status')).includes('原件已保留'))
  } finally { await windows.close() }
  console.log('PASS save protection: cancelled-copy recovery, subsequent edits, confirmed-copy readback and conflicting writes to a real shared file handle.')
}
