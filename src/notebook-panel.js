import { notebookPart, notebookText, orderedEntries } from './notebook.js'

export function mountNotebookPanel({ getBook, getName, pageCount, position, locate, edit, download, onOpen }) {
  const el = id => document.getElementById('notebook-' + id)
  const panel = el('panel'), toggle = el('toggle'), summary = el('summary'), input = el('entry')
  let active = null

  function entryLabel(entry) {
    return `第 ${entry.page + 1} 页 · ${entry.text.trim().split('\n', 1)[0] || '空白笔记'}`
  }

  function refreshList() {
    const book = getBook()
    const buttons = orderedEntries(book).map(entry => {
      const row = document.createElement('li'), button = document.createElement('button')
      button.type = 'button'
      button.dataset.entry = entry.id
      button.setAttribute('aria-pressed', String(active?.id === entry.id))
      button.textContent = entryLabel(entry)
      row.append(button)
      return row
    })
    el('entries').replaceChildren(...buttons)
    el('empty').hidden = buttons.length > 0 || Boolean(active)
    updateExport()
  }

  function updateExport() {
    const book = getBook()
    el('export').disabled = !book?.summary.trim() && !book?.entries.some(entry => entry.text.trim())
  }

  function select(entry) {
    active = entry
    el('editor').hidden = !entry
    if (entry) {
      el('entry-label').textContent = `第 ${entry.page + 1} 页的笔记`
      input.value = entry.text
      el('locate').disabled = entry.page >= pageCount()
      el('locate').textContent = el('locate').disabled ? '原页已移除' : '回到原页 ↗'
      el('delete').hidden = !notebookPart(getBook(), entry.id)
    }
    refreshList()
  }

  function close(focusToggle = false) {
    panel.hidden = true
    toggle.setAttribute('aria-expanded', 'false')
    active = null
    if (focusToggle) toggle.focus({ preventScroll: true })
  }

  function open() {
    onOpen()
    const book = getBook()
    panel.hidden = false
    toggle.setAttribute('aria-expanded', 'true')
    el('fields').hidden = !book
    el('hint').textContent = book ? '输入后自动留作本机草稿。点工具栏「保存」，笔记就会随 PDF 带走。'
      : '无法读取这份文件的笔记格式。保存 PDF 时会保留原笔记数据。'
    summary.value = book?.summary ?? ''
    input.value = ''
    if (book) select(null)
    else el('entries').replaceChildren()
    el('close').focus({ preventScroll: true })
  }

  toggle.addEventListener('click', () => panel.hidden ? open() : close(true))
  el('close').addEventListener('click', () => close(true))
  summary.addEventListener('input', () => {
    edit('summary', summary.value)
    updateExport()
  })
  el('add').addEventListener('click', () => {
    const anchor = position()
    if (!anchor) return
    select({ id: crypto.randomUUID(), ...anchor, text: '' })
    input.focus()
  })
  el('entries').addEventListener('click', event => {
    const button = event.target.closest('button[data-entry]')
    if (!button) return
    const entry = notebookPart(getBook(), button.dataset.entry)
    if (!entry) return
    select(entry)
    locate(entry)
    input.focus()
  })
  input.addEventListener('input', () => {
    if (!active) return
    active = { ...active, text: input.value }
    edit(active.id, active)
    el('delete').hidden = false
    const row = el('entries').querySelector('[aria-pressed="true"]')
    if (row) { row.textContent = entryLabel(active); updateExport() }
    else refreshList()
  })
  el('done').addEventListener('click', () => { select(null); el('add').focus() })
  el('locate').addEventListener('click', () => { if (active) locate(active) })
  el('delete').addEventListener('click', () => {
    if (!active || !window.confirm('删除第 ' + (active.page + 1) + ' 页的这条笔记？')) return
    edit(active.id, null)
    select(null)
    el('add').focus()
  })
  el('export').addEventListener('click', () => {
    const name = getName()
    download(notebookText(getBook(), name), name.replace(/\.pdf$/i, '') + '-论文笔记.txt', 'text/plain;charset=utf-8')
  })
  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !event.isComposing) { event.preventDefault(); close(true) }
  })
  return { close }
}
