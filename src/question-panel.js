import { questionText } from './pings.js'

export function mountQuestionPanel({ questions, select, locate, edit, onOpen }) {
  const byId = id => document.getElementById(id)
  const panel = byId('question-panel')
  const picker = byId('question-picker')
  const toggle = byId('question-toggle')
  let activeId = null
  let editingField = null
  const current = () => questions().find(mark => mark.id === activeId)

  function refresh() {
    const marks = questions().sort((a, b) => Number(!!a.resolved) - Number(!!b.resolved) || a.page - b.page || b.y - a.y)
    toggle.textContent = `文献疑问 (${marks.length})`
    toggle.setAttribute('aria-expanded', String(!panel.hidden))
    if (panel.hidden) return
    if (!marks.some(mark => mark.id === activeId)) activeId = marks[0]?.id || null
    const mark = current()
    byId('question-empty').hidden = Boolean(mark)
    byId('question-fields').hidden = !mark
    if (!mark) return
    picker.replaceChildren(...marks.map(item => new Option(
      `第 ${item.page + 1} 页 · ${item.resolved ? '已解' : '待解'} · ${item.questionNote?.trim().slice(0, 24) || '未填写'}`, item.id)))
    picker.value = mark.id
    byId('question-status').textContent = `第 ${mark.page + 1} 页 · ${mark.resolved ? '已解决' : '待解答'}`
    const note = byId('question-note'), answer = byId('question-answer')
    if (note.value !== (mark.questionNote || '')) note.value = mark.questionNote || ''
    if (answer.value !== (mark.answer || '')) answer.value = mark.answer || ''
    byId('question-resolve').textContent = mark.resolved ? '重新打开疑问' : '标为已解决'
    byId('question-resolve').disabled = !mark.resolved && !(note.value.trim() && answer.value.trim())
  }

  function close(focus = false) {
    panel.hidden = true
    editingField = null
    toggle.setAttribute('aria-expanded', 'false')
    select(null)
    if (focus) byId('tools-toggle').focus({ preventScroll: true })
  }

  function open(id, jump = false) {
    onOpen?.()
    activeId = id
    editingField = null
    panel.hidden = false
    refresh()
    if (!activeId) return
    select(activeId)
    if (jump) locate(activeId)
  }

  toggle.addEventListener('click', () => {
    if (panel.hidden) { open(activeId, true); byId('question-close').focus({ preventScroll: true }) }
    else close(true)
  })
  byId('question-close').addEventListener('click', () => close(true))
  picker.addEventListener('change', () => open(picker.value, true))
  byId('question-locate').addEventListener('click', () => locate(activeId))
  for (const [inputId, field] of [['question-note', 'questionNote'], ['question-answer', 'answer']]) {
    const input = byId(inputId)
    input.addEventListener('blur', () => { editingField = null })
    input.addEventListener('input', () => {
      const mark = current()
      if (!mark) return
      const value = questionText(input.value)
      const changes = { [field]: value }
      if (!value.trim()) changes.resolved = false
      edit(mark, changes, editingField !== field)
      editingField = field
      refresh()
    })
  }
  byId('question-resolve').addEventListener('click', () => {
    const mark = current()
    if (!mark) return
    edit(mark, { resolved: !mark.resolved }, true)
    refresh()
  })
  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); close(true) }
  })
  return {
    refresh,
    reset() { activeId = null; close() },
    expanded: id => !panel.hidden && activeId === id,
    toggleMark(id) { if (!panel.hidden && activeId === id) close(); else open(id) },
  }
}
