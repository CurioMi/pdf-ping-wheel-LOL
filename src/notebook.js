export function blankNotebook() {
  return { v: 1, summary: '', entries: [] }
}

export function validEntry(entry) {
  return entry && typeof entry.id === 'string' && /^[\w-]{1,80}$/.test(entry.id) && entry.id !== 'summary'
    && Number.isSafeInteger(entry.page) && entry.page >= 0
    && Number.isFinite(entry.offset) && entry.offset >= 0 && entry.offset <= 1
    && typeof entry.text === 'string'
}

export function validNotebook(book) {
  return book?.v === 1 && typeof book.summary === 'string' && Array.isArray(book.entries)
    && book.entries.every(validEntry) && new Set(book.entries.map(entry => entry.id)).size === book.entries.length
}

export function notebookPart(book, key) {
  return key === 'summary' ? book.summary : book.entries.find(entry => entry.id === key) ?? null
}

export function setNotebookPart(book, key, value) {
  if (key === 'summary') { book.summary = value; return }
  const index = book.entries.findIndex(entry => entry.id === key)
  if (value === null) {
    if (index >= 0) book.entries.splice(index, 1)
  } else if (index >= 0) book.entries[index] = value
  else book.entries.push(value)
}

export function orderedEntries(book) {
  return [...book.entries].sort((a, b) => a.page - b.page || a.offset - b.offset)
}

export function notebookText(book, fileName) {
  const sections = [fileName + ' · 论文笔记']
  if (book.summary.trim()) sections.push('整篇心得\n' + book.summary)
  for (const entry of orderedEntries(book)) {
    if (entry.text.trim()) sections.push('第 ' + (entry.page + 1) + ' 页\n' + entry.text)
  }
  return sections.join('\n\n') + '\n'
}
