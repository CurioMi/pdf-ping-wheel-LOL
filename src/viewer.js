import * as pdfjs from 'pdfjs-dist'
import {
  PINGS,
  WHEEL_PINGS,
  EMOTE_CENTER,
  WHEEL_EMOTES,
  MASTERY,
  NOTE,
  NOTE_MAX_CHARS,
  STAMP_TYPES,
  QUICK_TAP_MS,
  QUICK_TAP_PX,
  WHEEL,
  pingBadgeSvg,
  pingById,
  stampSize,
  noteLayout,
  noteSvg,
  wrapNoteText,
} from './pings.js'
import { buildSavedPdf, readPingPayload, stripPluginArtifacts } from './pdf-io.js'
import { hasSound, iconMarkup, wheelIconMarkup, originalPng, initializePingAssets, soundUrl } from './ping-assets.js'
import { PDFDocument } from 'pdf-lib'

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdf.worker.min.mjs', document.baseURI).href

const cMapUrl = new URL('cmaps/', document.baseURI).href
const standardFontDataUrl = new URL('standard_fonts/', document.baseURI).href

const state = {
  pdf: null,
  loadingTask: null,
  cleanBytes: null,
  fileName: '',
  fileHandle: null,
  scale: 1,
  pings: [],
  selectedId: null,
  undo: [],
  views: [],
  renderTasks: [],
  renderToken: 0,
  pointer: { x: 0, y: 0 },
  drag: null,
  alt: null,
  saving: false,
  chatOpen: false,
  chatAnchor: null,
  editingNoteId: null,
}

const pngCache = new Map()

const $ = (id) => document.getElementById(id)

function setStatus(text) {
  $('status').textContent = text
}

function setAssetStatus(text) {
  $('asset-status').textContent = text
}

function clamp(n, a, b) {
  if (a > b) return (a + b) / 2
  return Math.min(b, Math.max(a, n))
}

function round(n) {
  return Math.round(n * 100) / 100
}

function isPdf(file) {
  return file && (file.type === 'application/pdf' || /\.pdf$/i.test(file.name))
}

function typingTarget(el) {
  const tag = el?.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || el?.isContentEditable
}

function isAltKey(event) {
  return event.key === 'Alt' || event.code === 'AltLeft' || event.code === 'AltRight'
}

function enableTools(on) {
  $('save').disabled = !on
  $('mastery').disabled = !on
  $('chat-toggle').disabled = !on
  $('zoom-in').disabled = !on
  $('zoom-out').disabled = !on
  $('fit').disabled = !on
}

function fillLegend() {
  const host = $('legend')
  host.replaceChildren()
  for (const ping of PINGS) {
    const item = document.createElement('div')
    item.className = 'legend-item'
    item.innerHTML = `${iconMarkup(ping, 40)}<span>${ping.label}</span>`
    host.append(item)
  }
}

function wheelItems(mode) {
  return mode === 'emote' ? WHEEL_EMOTES : WHEEL_PINGS
}

function buildWheel(mode = 'ping') {
  const { size, cx, cy, inner, outer } = WHEEL
  const items = wheelItems(mode)
  const n = items.length
  const gap = 0.045
  const parts = items.map((stamp, index) => {
    const a0 = (index / n) * Math.PI * 2 + gap
    const a1 = ((index + 1) / n) * Math.PI * 2 - gap
    const mid = (a0 + a1) / 2
    const iconR = (inner + outer) / 2 - 6
    const labelR = (inner + outer) / 2 + 36
    const iconSize = mode === 'emote' ? 62 : 56
    const ix = cx + Math.sin(mid) * iconR - iconSize / 2
    const iy = cy - Math.cos(mid) * iconR - iconSize / 2
    const lx = cx + Math.sin(mid) * labelR
    const ly = cy - Math.cos(mid) * labelR
    return `
      <path class="slice" data-type="${stamp.id}" d="${wedge(cx, cy, inner, outer, a0, a1)}" fill="${stamp.color}"></path>
      <g class="slice-icon" data-type="${stamp.id}">${wheelIconMarkup(stamp, ix, iy, iconSize)}</g>
      <text class="slice-label" data-type="${stamp.id}" x="${lx.toFixed(2)}" y="${ly.toFixed(2)}" text-anchor="middle" dominant-baseline="middle">${stamp.label}</text>
    `
  }).join('')
  const center = mode === 'emote' ? wheelIconMarkup(EMOTE_CENTER, cx - 27, cy - 27, 54) : ''
  $('wheel').innerHTML = `
    <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">
      <circle class="wheel-plate" cx="${cx}" cy="${cy}" r="${outer + 10}"></circle>
      ${parts}
      <circle class="wheel-hub" cx="${cx}" cy="${cy}" r="${inner - 8}"></circle>
      ${mode === 'emote' ? `<g class="wheel-center-emote">${center}</g><text id="wheel-label" x="${cx}" y="${cy + 44}" text-anchor="middle" dominant-baseline="middle">${EMOTE_CENTER.label}</text>` : `<text id="wheel-label" x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle">取消</text>`}
    </svg>
  `
  $('wheel').dataset.mode = mode
}

function polar(cx, cy, r, angle) {
  return [cx + Math.sin(angle) * r, cy - Math.cos(angle) * r]
}

function wedge(cx, cy, r0, r1, a0, a1) {
  const [x0, y0] = polar(cx, cy, r1, a0)
  const [x1, y1] = polar(cx, cy, r1, a1)
  const [x2, y2] = polar(cx, cy, r0, a1)
  const [x3, y3] = polar(cx, cy, r0, a0)
  const large = a1 - a0 > Math.PI ? 1 : 0
  const n = (v) => v.toFixed(2)
  return `M ${n(x0)} ${n(y0)} A ${r1} ${r1} 0 ${large} 1 ${n(x1)} ${n(y1)} L ${n(x2)} ${n(y2)} A ${r0} ${r0} 0 ${large} 0 ${n(x3)} ${n(y3)} Z`
}

function pageAt(x, y) {
  for (const view of state.views) {
    const rect = view.wrap.getBoundingClientRect()
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return view
  }
  return null
}

function clientToPdf(view, x, y) {
  const rect = view.wrap.getBoundingClientRect()
  return view.viewport.convertToPdfPoint(x - rect.left, y - rect.top)
}

function clampPdf(view, x, y, stampOrType = 'caution') {
  const [x0, y0, x1, y1] = view.page.view
  const width = (typeof stampOrType === 'object' && Number.isFinite(stampOrType.width)) ? stampOrType.width : stampSize(stampOrType)
  const height = (typeof stampOrType === 'object' && Number.isFinite(stampOrType.height)) ? stampOrType.height : stampSize(stampOrType)
  const halfW = width / 2
  const halfH = height / 2
  return [clamp(x, x0 + halfW, x1 - halfW), clamp(y, y0 + halfH, y1 - halfH)]
}

function placeElement(el, ping, view) {
  const [vx, vy] = view.viewport.convertToViewportPoint(ping.x, ping.y)
  const size = (ping.width || stampSize(ping.type)) * state.scale
  const height = (ping.height || stampSize(ping.type)) * state.scale
  el.style.width = `${size}px`
  el.style.height = `${height}px`
  el.style.left = `${vx}px`
  el.style.top = `${vy}px`
  el.dataset.id = ping.id
  el.dataset.type = ping.type
  el.dataset.page = String(ping.page)
  el.dataset.x = ping.x.toFixed(2)
  el.dataset.y = ping.y.toFixed(2)
}

function paintSelection() {
  for (const el of document.querySelectorAll('.stamp')) {
    el.classList.toggle('is-selected', el.dataset.id === state.selectedId)
  }
}

function layoutStamps() {
  for (const view of state.views) view.layer.replaceChildren()
  for (const ping of state.pings) {
    const view = state.views[ping.page]
    if (!view) continue
    const spec = pingById(ping.type)
    if (!spec) continue
    const el = document.createElement('button')
    el.type = 'button'
    el.className = 'stamp'
    el.setAttribute('aria-label', spec.category === 'note' ? `备注：${ping.text}` : spec.label)
    if (spec.category === 'note') {
      el.classList.add('note-stamp')
      el.textContent = ping.text
      el.title = '备注（双击编辑）'
      el.style.fontSize = `${12 * state.scale}px`
      el.style.lineHeight = `${18 * state.scale}px`
      el.style.padding = `${12 * state.scale}px ${12 * state.scale}px`
      el.addEventListener('dblclick', (event) => { event.preventDefault(); event.stopPropagation(); openChatComposer(ping.id) })
    } else {
      el.innerHTML = iconMarkup(spec)
    }
    if (ping.id === state.selectedId) el.classList.add('is-selected')
    placeElement(el, ping, view)
    el.addEventListener('pointerdown', onStampPointerDown)
    view.layer.append(el)
  }
}

function onStampPointerDown(event) {
  if (event.button !== 0 || state.alt) return
  event.preventDefault()
  event.stopPropagation()
  const id = event.currentTarget.dataset.id
  state.selectedId = id
  paintSelection()
  state.drag = {
    id,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    moved: false,
  }
  event.currentTarget.setPointerCapture?.(event.pointerId)
}

function moveDrag(event) {
  const drag = state.drag
  if (!drag || event.pointerId !== drag.pointerId) return
  const dist = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY)
  if (!drag.moved && dist < 4) return
  drag.moved = true
  document.body.classList.add('is-dragging')
  const ping = state.pings.find((item) => item.id === drag.id)
  if (!ping) return
  const view = pageAt(event.clientX, event.clientY) || state.views[ping.page]
  if (!view) return
  const [rawX, rawY] = clientToPdf(view, event.clientX, event.clientY)
  const [x, y] = clampPdf(view, rawX, rawY, ping)
  ping.page = view.index
  ping.x = round(x)
  ping.y = round(y)
  const el = document.querySelector(`.stamp[data-id="${CSS.escape(ping.id)}"]`)
  if (!el) return
  if (el.parentElement !== view.layer) view.layer.append(el)
  placeElement(el, ping, view)
}

function finishDrag() {
  if (!state.drag) return
  const drag = state.drag
  state.drag = null
  document.body.classList.remove('is-dragging')
  if (drag.moved) layoutStamps()
  else paintSelection()
}

function bytesToBase64(bytes) {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  return btoa(binary)
}

function base64ToBytes(base64) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function addPing(type, page, x, y) {
  const spec = pingById(type)
  const ping = { id: crypto.randomUUID(), type, page, x, y, width: stampSize(type), height: stampSize(type) }
  const bytes = originalPng(type)
  // Keep one image copy per stamp type in the document metadata. This lets the
  // extension restore a Riot emote even on a machine without that asset pack.
  if (bytes && spec && spec.category !== 'ping') ping.assetData = bytesToBase64(bytes)
  state.pings.push(ping)
  state.undo.push({ op: 'stamp', ping: { ...ping } })
  if (state.undo.length > 100) state.undo.shift()
  state.selectedId = ping.id
  layoutStamps()
  if (spec?.category === 'ping') playPing(type)
  setStatus(`已放置${spec?.label || '标记'}`)
}

function closeChatComposer() {
  state.chatOpen = false
  state.chatAnchor = null
  state.editingNoteId = null
  $('chat-composer').hidden = true
}

function openChatComposer(editNoteId = null) {
  if (!state.pdf) {
    setStatus('请先打开一份 PDF')
    return
  }
  const existing = editNoteId ? state.pings.find((ping) => ping.id === editNoteId && ping.type === NOTE.id) : null
  state.chatOpen = true
  const anchorView = !existing ? pageAt(state.pointer.x, state.pointer.y) : null
  if (anchorView) {
    const [anchorX, anchorY] = clientToPdf(anchorView, state.pointer.x, state.pointer.y)
    state.chatAnchor = { page: anchorView.index, x: round(anchorX), y: round(anchorY) }
  } else if (!existing) {
    state.chatAnchor = null
  }
  state.editingNoteId = existing?.id || null
  $('chat-composer').hidden = false
  $('chat-input').value = existing?.text || ''
  $('chat-title').textContent = existing ? '编辑备注' : '队伍聊天 · PDF 备注'
  $('chat-hint').textContent = existing ? 'Enter 保存修改 · Esc 取消' : (state.chatAnchor ? 'Enter 发送 · Shift+Enter 换行 · Esc 关闭；备注会放在鼠标指向的位置' : '先将鼠标移到 PDF 页面选择备注位置；Enter 发送，Esc 关闭')
  $('chat-send').textContent = existing ? '保存' : '发送'
  $('chat-input').focus()
  if (existing) $('chat-input').setSelectionRange(existing.text.length, existing.text.length)
}

function addNote(text, page, x, y, dimensions) {
  const note = {
    id: crypto.randomUUID(), type: NOTE.id, page, x, y,
    width: dimensions.width, height: dimensions.height, text,
  }
  state.pings.push(note)
  state.undo.push({ op: 'stamp', ping: { ...note } })
  if (state.undo.length > 100) state.undo.shift()
  state.selectedId = note.id
  layoutStamps()
  setStatus('备注已添加到 PDF；保存后会一并写入文件')
}

function submitChatNote() {
  const rawText = $('chat-input').value.replace(/\r\n?/g, '\n').trim().slice(0, NOTE_MAX_CHARS)
  const text = wrapNoteText(rawText).join('\n').trim()
  if (!text) {
    setStatus('请输入备注内容')
    $('chat-input').focus()
    return
  }
  if (state.editingNoteId) {
    const index = state.pings.findIndex((ping) => ping.id === state.editingNoteId && ping.type === NOTE.id)
    if (index < 0) {
      closeChatComposer()
      setStatus('要编辑的备注已不存在')
      return
    }
    const note = state.pings[index]
    if (note.text === text) {
      closeChatComposer()
      setStatus('备注未发生变化')
      return
    }
    const before = { ...note }
    const dimensions = noteLayout(text)
    note.text = text
    note.width = dimensions.width
    note.height = dimensions.height
    const view = state.views[note.page]
    if (view) {
      const [x, y] = clampPdf(view, note.x, note.y, note)
      note.x = round(x)
      note.y = round(y)
    }
    state.undo.push({ op: 'edit', ping: before, index })
    if (state.undo.length > 100) state.undo.shift()
    state.selectedId = note.id
    layoutStamps()
    closeChatComposer()
    setStatus('备注已修改')
    return
  }
  const anchor = state.chatAnchor
  const view = anchor ? state.views[anchor.page] : null
  if (!view) {
    setStatus('请先把鼠标移到 PDF 页面上选择备注位置，再发送')
    $('chat-input').focus()
    return
  }
  const dimensions = noteLayout(text)
  const [x, y] = clampPdf(view, anchor.x, anchor.y, { ...NOTE, ...dimensions })
  addNote(text, view.index, round(x), round(y), dimensions)
  closeChatComposer()
}

function placeAtPointer(type) {
  if (!state.pdf) return
  const view = pageAt(state.pointer.x, state.pointer.y)
  if (!view) {
    setStatus('请先将鼠标移到 PDF 页面，再使用快捷键')
    return
  }
  const [rawX, rawY] = clientToPdf(view, state.pointer.x, state.pointer.y)
  const [x, y] = clampPdf(view, rawX, rawY, type)
  addPing(type, view.index, round(x), round(y))
}

let audioCtx = null

function audioContext() {
  const Ctx = window.AudioContext || window.webkitAudioContext
  if (!Ctx) return null
  if (!audioCtx) audioCtx = new Ctx()
  if (audioCtx.state === 'suspended') audioCtx.resume()
  return audioCtx
}

function envTone(ctx, { freq, dur, type = 'sine', peak = 0.1, delay = 0, to }) {
  const start = ctx.currentTime + delay
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, start)
  if (to) osc.frequency.exponentialRampToValueAtTime(Math.max(40, to), start + dur)
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.016)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(start)
  osc.stop(start + dur + 0.03)
}

/** Short original tones. Each voice is a few oscillators, not a recording. */
function playSyntheticPing(type) {
  const ctx = audioContext()
  if (!ctx) return
  const pitch = {
    danger: 240, push: 580, arrive: 420, allin: 490,
    assist: 520, needvision: 660, question: 740,
    enemyvision: 310, caution: 440,
  }[type] || 460
  envTone(ctx, { freq: pitch, dur: 0.13, type: 'triangle', peak: 0.075 })
  envTone(ctx, { freq: Math.max(80, pitch * 0.82), dur: 0.16, delay: 0.09, peak: 0.045 })
}

function playPing(type) {
  const spec = pingById(type)
  if (!spec || !hasSound(type)) return playSyntheticPing(type)
  const audio = new Audio(soundUrl(spec))
  audio.volume = 0.72
  audio.addEventListener('error', () => playSyntheticPing(type), { once: true })
  audio.play().catch((error) => {
    // No synthetic fallback for browser autoplay restrictions: avoid unwanted noise.
    console.debug('Unable to play local ping audio', error)
  })
}

function deleteSelected() {
  if (!state.selectedId) return
  const index = state.pings.findIndex((ping) => ping.id === state.selectedId)
  if (index < 0) return
  const [ping] = state.pings.splice(index, 1)
  state.undo.push({ op: 'delete', ping: { ...ping }, index })
  state.selectedId = null
  layoutStamps()
  setStatus('已删除')
}

function undo() {
  const action = state.undo.pop()
  if (!action) {
    setStatus('没有可撤销的操作')
    return
  }
  if (action.op === 'stamp') {
    state.pings = state.pings.filter((ping) => ping.id !== action.ping.id)
    if (state.selectedId === action.ping.id) state.selectedId = null
    setStatus(action.ping.type === NOTE.id ? '已撤销添加备注' : '已撤销盖下')
  } else if (action.op === 'edit') {
    const index = state.pings.findIndex((ping) => ping.id === action.ping.id)
    if (index >= 0) state.pings[index] = action.ping
    state.selectedId = action.ping.id
    setStatus('已撤销备注修改')
  } else {
    state.pings.splice(Math.min(action.index, state.pings.length), 0, action.ping)
    state.selectedId = action.ping.id
    setStatus('已撤销删除')
  }
  layoutStamps()
}

function hideWheel() {
  $('wheel').hidden = true
}

function showWheel() {
  const alt = state.alt
  if (!alt || alt.shown || alt.page == null) return
  alt.shown = true
  buildWheel(alt.mode)
  const wheel = $('wheel')
  wheel.hidden = false
  wheel.style.left = `${alt.cx}px`
  wheel.style.top = `${alt.cy}px`
  aimWheel(state.pointer.x, state.pointer.y)
}

function paintWheel(type) {
  const label = $('wheel-label')
  const selected = type ? pingById(type) : null
  if (label) label.textContent = selected ? selected.label : (state.alt?.mode === 'emote' ? '选择表情' : '取消')
  for (const el of document.querySelectorAll('#wheel .slice, #wheel .slice-icon, #wheel .slice-label')) {
    el.classList.toggle('is-hot', el.dataset.type === type)
  }
}

function aimWheel(x, y) {
  const alt = state.alt
  if (!alt) return
  const dist = Math.hypot(x - alt.cx, y - alt.cy)
  if (!alt.shown && dist >= QUICK_TAP_PX) showWheel()
  if (!alt.shown) return
  let type = null
  if (dist >= WHEEL.inner) {
    let angle = Math.atan2(y - alt.cy, x - alt.cx) + Math.PI / 2
    if (angle < 0) angle += Math.PI * 2
    const items = wheelItems(alt.mode)
    const index = Math.min(items.length - 1, Math.floor((angle / (Math.PI * 2)) * items.length))
    type = items[index].id
  }
  alt.slice = type
  paintWheel(type)
}

function beginAlt(mode = 'ping') {
  if (state.alt || !state.pdf) return
  const view = pageAt(state.pointer.x, state.pointer.y)
  let point = null
  if (view) {
    const [rawX, rawY] = clientToPdf(view, state.pointer.x, state.pointer.y)
    const [x, y] = clampPdf(view, rawX, rawY, mode === 'emote' ? EMOTE_CENTER.id : 'caution')
    point = { page: view.index, x: round(x), y: round(y) }
  }
  const alt = {
    mode,
    cx: state.pointer.x,
    cy: state.pointer.y,
    page: point ? point.page : null,
    x: point ? point.x : null,
    y: point ? point.y : null,
    t: performance.now(),
    shown: false,
    slice: null,
    clicked: false,
    timer: 0,
  }
  alt.timer = window.setTimeout(() => {
    if (state.alt === alt && mode === 'emote') showWheel()
  }, 180)
  state.alt = alt
}

function dismissAlt() {
  if (!state.alt) return
  clearTimeout(state.alt.timer)
  state.alt = null
  hideWheel()
}

function commitAlt() {
  const alt = state.alt
  if (!alt) return
  clearTimeout(alt.timer)
  state.alt = null
  hideWheel()
  if (alt.page == null) return
  const dist = Math.hypot(state.pointer.x - alt.cx, state.pointer.y - alt.cy)
  const dt = performance.now() - alt.t
  const quick = dt <= QUICK_TAP_MS && dist <= QUICK_TAP_PX
  if (alt.mode === 'emote') {
    if (quick) {
      addPing(EMOTE_CENTER.id, alt.page, alt.x, alt.y)
      return
    }
    if (alt.shown && alt.slice && dist >= WHEEL.inner) {
      addPing(alt.slice, alt.page, alt.x, alt.y)
      return
    }
    setStatus('已取消表情')
    return
  }
  if (alt.clicked && dist <= QUICK_TAP_PX) {
    addPing(alt.quickType || 'caution', alt.page, alt.x, alt.y)
    return
  }
  if (quick) {
    setStatus('信号已取消；普通信号可按 G 放置')
    return
  }
  if (alt.shown && alt.slice && dist >= WHEEL.inner) {
    addPing(alt.slice, alt.page, alt.x, alt.y)
    return
  }
  setStatus('已取消信号')
}

function cancelRenders() {
  for (const task of state.renderTasks) {
    try { task.cancel() } catch { /* already finished */ }
  }
  state.renderTasks = []
}

async function renderPages() {
  const token = ++state.renderToken
  cancelRenders()
  const holder = $('pages')
  const stage = $('stage')
  const scrollRatio = stage.scrollTop / Math.max(1, stage.scrollHeight)
  holder.replaceChildren()
  state.views = []
  const pdf = state.pdf
  for (let number = 1; number <= pdf.numPages; number++) {
    if (token !== state.renderToken) return
    const page = await pdf.getPage(number)
    if (token !== state.renderToken) return
    const viewport = page.getViewport({ scale: state.scale })
    const sheet = document.createElement('div')
    sheet.className = 'sheet'
    const wrap = document.createElement('div')
    wrap.className = 'page-wrap'
    wrap.style.width = `${viewport.width}px`
    wrap.style.height = `${viewport.height}px`
    const canvas = document.createElement('canvas')
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.floor(viewport.width * dpr)
    canvas.height = Math.floor(viewport.height * dpr)
    canvas.style.width = `${viewport.width}px`
    canvas.style.height = `${viewport.height}px`
    const context = canvas.getContext('2d', { willReadFrequently: true })
    const layer = document.createElement('div')
    layer.className = 'ping-layer'
    const caption = document.createElement('div')
    caption.className = 'page-caption'
    caption.textContent = `第 ${number} 页`
    wrap.append(canvas, layer)
    sheet.append(wrap, caption)
    holder.append(sheet)
    const view = { index: number - 1, page, viewport, wrap, layer }
    state.views.push(view)
    const task = page.render({
      canvasContext: context,
      viewport,
      transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0],
    })
    state.renderTasks.push(task)
    try {
      await task.promise
    } catch (error) {
      if (error?.name === 'RenderingCancelledException') return
      throw error
    }
  }
  if (token !== state.renderToken) return
  layoutStamps()
  $('zoom-label').textContent = `${Math.round(state.scale * 100)}%`
  stage.scrollTop = scrollRatio * stage.scrollHeight
}

async function showPdf(bytes) {
  if (state.loadingTask) {
    try { await state.loadingTask.destroy() } catch { /* ignore */ }
    state.loadingTask = null
  }
  cancelRenders()
  const loadingTask = pdfjs.getDocument({
    data: bytes.slice(),
    cMapUrl,
    cMapPacked: true,
    standardFontDataUrl,
  })
  state.loadingTask = loadingTask
  const pdf = await loadingTask.promise
  if (!pdf.numPages) throw new Error('这份 PDF 没有页面')
  state.pdf = pdf
  const first = await pdf.getPage(1)
  const base = first.getViewport({ scale: 1 })
  const available = Math.max(240, $('stage').clientWidth - 48)
  state.scale = clamp(available / base.width, 0.55, 1.5)
  $('empty').hidden = true
  $('pages').hidden = false
  enableTools(true)
  $('file-name').textContent = state.fileName
  document.title = `${state.fileName} — PDF Ping Wheel`
  await renderPages()
}

async function loadFile(file) {
  if (!isPdf(file)) {
    setStatus('请选择 PDF 文件')
    return
  }
  setStatus('正在打开…')
  dismissAlt()
  const raw = new Uint8Array(await file.arrayBuffer())
  let clean = raw
  let pings = []
  let payloadWarning = ''
  try {
    const doc = await PDFDocument.load(raw.slice(), { updateMetadata: false })
    const payload = readPingPayload(doc)
    if (payload.error) {
      setStatus('标记数据读不出来，只显示文件里已经画上的图案')
    } else if (payload.found) {
      stripPluginArtifacts(doc)
      clean = new Uint8Array(await doc.save({ updateMetadata: false }))
      pings = payload.pings
      payloadWarning = payload.warning || ''
    }
  } catch (error) {
    setStatus(`这份 PDF 打不开：${error?.message || error}`)
    return
  }
  state.cleanBytes = clean.slice()
  state.pings = pings
  state.undo = []
  state.selectedId = null
  state.fileName = file.name || 'document.pdf'
  try {
    await showPdf(state.cleanBytes.slice())
  } catch (error) {
    setStatus(`页面渲染失败：${error?.message || error}`)
    return
  }
  const restored = pings.length ? `，已恢复 ${pings.length} 个标记` : ''
  const warning = payloadWarning ? `。${payloadWarning}` : ''
  setStatus(`已打开 ${state.fileName}${restored}${warning}`)
}

async function rasterize(ping) {
  if (ping.type === NOTE.id) {
    const layout = noteLayout(ping.text)
    const width = Number.isFinite(ping.width) ? ping.width : layout.width
    const height = Number.isFinite(ping.height) ? ping.height : layout.height
    const svg = noteSvg({ ...ping, width, height })
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    try {
      const image = new Image()
      image.src = url
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(width * 2))
      canvas.height = Math.max(1, Math.round(height * 2))
      const context = canvas.getContext('2d')
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      const png = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
      if (!png) throw new Error('无法生成备注图片')
      return new Uint8Array(await png.arrayBuffer())
    } finally {
      URL.revokeObjectURL(url)
    }
  }
  if (typeof ping.assetData === 'string' && /^[A-Za-z0-9+/]+={0,2}$/.test(ping.assetData)) {
    const restored = base64ToBytes(ping.assetData)
    if (restored.length > 64 && restored[0] === 137 && restored[1] === 80 && restored[2] === 78 && restored[3] === 71) return restored
  }
  const riotBytes = originalPng(ping.type)
  if (riotBytes) return riotBytes
  const spec = pingById(ping.type) || ping
  const size = 128
  const svg = pingBadgeSvg(spec, size)
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const context = canvas.getContext('2d')
    context.drawImage(image, 0, 0, size, size)
    const probe = context.getImageData(size / 2, size * 0.16, 1, 1).data
    if (probe[3] < 200) throw new Error('标记图是空的')
    const png = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!png) throw new Error('无法栅格化标记')
    return new Uint8Array(await png.arrayBuffer())
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function pngMap(pings) {
  const out = {}
  const usedTypes = new Set(pings.map((p) => p.type))
  for (const stamp of STAMP_TYPES) {
    if (!usedTypes.has(stamp.id)) continue
    if (!pngCache.has(stamp.id)) {
      const representative = pings.find((p) => p.type === stamp.id)
      pngCache.set(stamp.id, await rasterize(representative || stamp))
    }
    out[stamp.id] = pngCache.get(stamp.id)
  }
  for (const note of pings.filter((ping) => ping.type === NOTE.id)) {
    out[note.id] = await rasterize(note)
  }
  return out
}

function downloadBytes(bytes, filename) {
  const blob = new Blob([bytes], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 2500)
}

async function savePdf() {
  if (!state.cleanBytes || state.saving) return
  state.saving = true
  $('save').disabled = true
  setStatus('正在写入…')
  try {
    for (const ping of state.pings) {
      const spec = pingById(ping.type)
      const bytes = originalPng(ping.type)
      if (spec && spec.category !== 'ping' && !ping.assetData && bytes) ping.assetData = bytesToBase64(bytes)
    }
    const bytes = new Uint8Array(await buildSavedPdf(state.cleanBytes, state.pings, await pngMap(state.pings)))
    const name = /\.pdf$/i.test(state.fileName) ? state.fileName : `${state.fileName}.pdf`
    if (state.fileHandle?.createWritable) {
      try {
        const writable = await state.fileHandle.createWritable()
        await writable.write(bytes)
        await writable.close()
        setStatus('已覆盖保存原文件')
        return
      } catch (error) {
        console.warn(error)
      }
    }
    downloadBytes(bytes, name)
    setStatus(`已下载 ${name}`)
  } catch (error) {
    setStatus(`保存失败：${error?.message || error}`)
  } finally {
    state.saving = false
    $('save').disabled = !state.cleanBytes
  }
}

async function openFromPicker() {
  if (window.showOpenFilePicker) {
    try {
      const [handle] = await window.showOpenFilePicker({
        multiple: false,
        types: [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }],
      })
      state.fileHandle = handle
      await loadFile(await handle.getFile())
      return
    } catch (error) {
      if (error?.name === 'AbortError') return
    }
  }
  state.fileHandle = null
  $('file').click()
}

async function zoomBy(factor) {
  if (!state.pdf) return
  state.scale = clamp(state.scale * factor, 0.4, 3)
  await renderPages()
}

function onKeyDown(event) {
  if (event.key === 'Escape' && state.chatOpen) {
    event.preventDefault()
    event.stopPropagation()
    closeChatComposer()
    return
  }
  const plainEnter = event.key === 'Enter' && !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey
  const nonControlTarget = !typingTarget(event.target) && !event.target?.closest?.('button, a, select, [role="button"]')
  if (plainEnter && state.chatOpen && nonControlTarget) {
    event.preventDefault()
    event.stopPropagation()
    submitChatNote()
    return
  }
  if (plainEnter && nonControlTarget) {
    if (!state.pdf) return
    event.preventDefault()
    event.stopPropagation()
    openChatComposer()
    return
  }
  if (typingTarget(event.target)) return
  if (!state.pdf) return

  // Native LoL-like direct shortcuts. Ctrl+6 can be intercepted by Chrome's
  // switch-to-tab shortcut; the visible Mastery button is the reliable fallback.
  if (event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey && (event.key === '6' || event.code === 'Digit6')) {
    event.preventDefault()
    event.stopPropagation()
    placeAtPointer(MASTERY.id)
    return
  }
  if (!event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey && event.key.toLowerCase() === 'g') {
    event.preventDefault()
    event.stopPropagation()
    placeAtPointer('caution')
    return
  }
  if (!event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey && event.key.toLowerCase() === 'v') {
    event.preventDefault()
    event.stopPropagation()
    placeAtPointer('danger')
    return
  }
  if (!event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey && event.key.toLowerCase() === 'h') {
    event.preventDefault()
    event.stopPropagation()
    placeAtPointer('enemyvision')
    return
  }
  if (isAltKey(event)) {
    event.preventDefault()
    event.stopPropagation()
    if (event.repeat || state.alt) return
    if (event.ctrlKey || event.metaKey || event.shiftKey) return
    beginAlt('ping')
    return
  }
  if (event.key.toLowerCase() === 't' && !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey) {
    event.preventDefault()
    event.stopPropagation()
    if (event.repeat || state.alt) return
    beginAlt('emote')
    return
  }
  if (state.alt) dismissAlt()
  if ((event.key === 'Delete' || event.key === 'Backspace') && !typingTarget(event.target)) {
    event.preventDefault()
    deleteSelected()
    return
  }
  if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z' && !typingTarget(event.target)) {
    event.preventDefault()
    undo()
    return
  }
  if (event.key === 'Escape') dismissAlt()
}

function onKeyUp(event) {
  if (isAltKey(event)) {
    event.preventDefault()
    event.stopPropagation()
    if (state.alt?.mode === 'ping') commitAlt()
    return
  }
  if (event.key.toLowerCase() === 't' && state.alt?.mode === 'emote') {
    event.preventDefault()
    event.stopPropagation()
    commitAlt()
  }
}

function onPointerMove(event) {
  state.pointer.x = event.clientX
  state.pointer.y = event.clientY
  if (state.chatOpen && !state.editingNoteId && !event.target?.closest?.('.chat-composer, .bar, .help, .status, #wheel')) {
    const anchorView = pageAt(event.clientX, event.clientY)
    if (anchorView) {
      const [anchorX, anchorY] = clientToPdf(anchorView, event.clientX, event.clientY)
      state.chatAnchor = { page: anchorView.index, x: round(anchorX), y: round(anchorY) }
      $('chat-hint').textContent = 'Enter 发送 · Shift+Enter 换行 · Esc 关闭；备注会放在鼠标指向的位置'
    }
  }
  if (state.drag) moveDrag(event)
  if (state.alt) aimWheel(event.clientX, event.clientY)
}

function wire() {
  fillLegend()
  buildWheel()
  enableTools(false)
  initializePingAssets().then(({pings, emotes, mastery, sounds}) => {
    pngCache.clear()
    fillLegend()
    buildWheel()
    layoutStamps()
    setAssetStatus(`素材：信号 ${pings}/9、表情 ${emotes}/9、亮牌 ${mastery}/1、音效 ${sounds}/9`)
  }).catch((error) => console.warn('Local ping asset scan failed:', error))
  $('open').addEventListener('click', () => { openFromPicker() })
  $('open-empty').addEventListener('click', () => { openFromPicker() })
  $('save').addEventListener('click', () => { savePdf() })
  $('mastery').addEventListener('click', () => { placeAtPointer(MASTERY.id) })
  $('chat-toggle').addEventListener('click', () => openChatComposer())
  $('chat-send').addEventListener('click', submitChatNote)
  $('chat-cancel').addEventListener('click', closeChatComposer)
  $('chat-input').addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeChatComposer(); return }
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.stopPropagation(); submitChatNote() }
  })
  $('zoom-in').addEventListener('click', () => { zoomBy(1.15) })
  $('zoom-out').addEventListener('click', () => { zoomBy(1 / 1.15) })
  $('fit').addEventListener('click', async () => {
    if (!state.pdf) return
    const base = state.views[0]?.page.getViewport({ scale: 1 })
    if (!base) return
    const available = Math.max(240, $('stage').clientWidth - 48)
    state.scale = clamp(available / base.width, 0.55, 1.5)
    await renderPages()
  })
  $('file').addEventListener('change', async () => {
    const file = $('file').files?.[0]
    $('file').value = ''
    if (!file) return
    state.fileHandle = null
    await loadFile(file)
  })
  const stage = $('stage')
  stage.addEventListener('dragover', (event) => {
    event.preventDefault()
    stage.classList.add('is-drop')
  })
  stage.addEventListener('dragleave', () => stage.classList.remove('is-drop'))
  stage.addEventListener('drop', (event) => {
    event.preventDefault()
    stage.classList.remove('is-drop')
    const file = event.dataTransfer?.files?.[0]
    if (!file) return
    state.fileHandle = null
    loadFile(file)
  })
  document.addEventListener('pointerdown', (event) => {
    const clickedPage = event.button === 0 ? pageAt(event.clientX, event.clientY) : null
    if (state.alt?.mode === 'ping' && clickedPage) {
      const [rawX, rawY] = clientToPdf(clickedPage, event.clientX, event.clientY)
      const [x, y] = clampPdf(clickedPage, rawX, rawY, 'caution')
      Object.assign(state.alt, {
        clicked: true,
        cx: event.clientX,
        cy: event.clientY,
        page: clickedPage.index,
        x: round(x),
        y: round(y),
        t: performance.now(),
      })
      event.preventDefault()
      event.stopPropagation()
      return
    }
    if (!state.alt && event.ctrlKey && event.button === 0 && clickedPage && !event.target.closest('.bar, .help, .status')) {
      const [rawX, rawY] = clientToPdf(clickedPage, event.clientX, event.clientY)
      const [x, y] = clampPdf(clickedPage, rawX, rawY, 'danger')
      state.alt = {
        mode: 'ping', clicked: true, quickType: 'danger',
        cx: event.clientX, cy: event.clientY,
        page: clickedPage.index, x: round(x), y: round(y),
        t: performance.now(), shown: false, slice: null, timer: 0,
      }
      event.preventDefault()
      event.stopPropagation()
      return
    }
    if (event.target.closest('.stamp, .bar, button, .help, .status')) return
    state.selectedId = null
    paintSelection()
  }, true)
  window.addEventListener('pointermove', onPointerMove, true)
  window.addEventListener('pointerup', (event) => {
    if (state.alt?.mode === 'ping' && state.alt.clicked) {
      commitAlt()
      return
    }
    if (state.drag && event.pointerId === state.drag.pointerId) finishDrag()
  }, true)
  window.addEventListener('pointercancel', () => finishDrag(), true)
  window.addEventListener('keydown', onKeyDown, true)
  window.addEventListener('keyup', onKeyUp, true)
  window.addEventListener('blur', () => dismissAlt())
}

wire()
