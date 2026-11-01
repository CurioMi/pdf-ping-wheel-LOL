import { COMPANIONS, companionState } from './companions.js'
import { DAILY_QUESTS, questProgress } from './progression.js'

const book = '<path d="M3 5c3-1 6-.5 9 1.8C15 4.5 18 4 21 5v13c-3-1-6-.5-9 1.5C9 17.5 6 17 3 18zM12 7v12"/>'
const ribbon = '<path d="M6 3.8h12v16.8l-6-4-6 4zM9 8h6"/>'
const question = '<path d="M6 18.5 3.7 21l.7-5A8.2 8.2 0 1 1 6 18.5ZM9.3 9.2c.2-3.6 6.4-3.7 6.1 0-.1 2-3.4 2-3.4 4.5"/><circle cx="12" cy="16.4" r=".9" fill="currentColor" stroke="none"/>'
const quill = '<path d="M4 20c2-6 4-11 10-15 3-1.5 5-1 6.5-1-1 6-4 11-10 12.5l-2.5-.3M4 20 16 8"/>'
const sunrise = '<path d="M3 17h18M6 14a6 6 0 0 1 12 0M12 3v2M4.5 7l2 1.5m13-1.5-2 1.5"/>'
const glyphs = { minutes: book, totalMinutes: book, pages: ribbon, reviews: question, notes: quill, totalNotes: quill, days: sunrise }
const sealLabels = { 'first-win': ['阅读', '分钟'], vision: ['标记', '页'], revisit: ['解疑', '个'] }
const headerQuests = DAILY_QUESTS.filter(q => Object.hasOwn(sealLabels, q.id))

export function taskGlyph(metric) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">${glyphs[metric]}</svg>`
}

export function readerTasks(profile, date) {
  return headerQuests.map(q => {
    const { value, claimed } = questProgress(profile, q, date)
    const [label, unit] = sealLabels[q.id]
    const count = Math.floor(value)
    return { metric: q.metric, label, count, goal: q.goal, unit,
      status: claimed ? 'done' : value > 0 ? 'started' : 'empty',
      hint: `${q.description} · ${count}/${q.goal} ${unit}${claimed ? ' · 已完成' : ''}` }
  })
}

export function taskSeal(task) {
  return `<span class="task-seal" data-status="${task.status}" title="${task.hint}">${taskGlyph(task.metric)}</span>`
}

// Original silhouettes share one drawing at toolbar and card sizes. Each stage changes the outline.
const lantern = '<path d="m32 6 17 11-5 27-12 9-12-9-5-27z" fill="#33454a" stroke="#cbb98a" stroke-width="3"/><path d="m32 19 7 12-7 9-7-9z" fill="#e5c98e"/>'
const egg = '<path d="M32 8c-8 0-19 17-18 31 .6 10 8 15 18 15s18-5 18-15C51 25 40 8 32 8Z" fill="#8c493b" stroke="#f0bf85" stroke-width="2.8"/><path d="m20 34 10 4-3 6 12-6" fill="none" stroke="#ffce92" stroke-width="3" stroke-linecap="round"/><path d="M23 25c2-5 4-8 7-10" fill="none" stroke="#ed9e6d" stroke-width="3.4" stroke-linecap="round"/>'
const hatchling = '<path d="M16 49q-5-3-7-11 6 4 12 2c.3-6-1-12 3-17l-2-10 9 7 6-8 1 9c6 0 10 4 10 8l7 3-2 5-10 1c-2 12-12 16-21 14Z" fill="#be6f4f" stroke="#f3c08a" stroke-width="2.4" stroke-linejoin="round"/><path d="M33 43q5 0 9-5c-2 8-6 11-11 12z" fill="#f1c887"/><circle cx="40.5" cy="27.5" r="2" fill="#182635"/>'
const wing = '<path d="M26 45C16 36 8 23 5 7c8 6 13 7 19 10l-3 4 9 2-3 5 7 4z" fill="#8f4b3d" stroke="#f0ac74" stroke-width="2.2" stroke-linejoin="round"/><path d="m9 13 13 14-4-7" fill="none" stroke="#de9470" stroke-width="1.7" stroke-linecap="round"/>'
const spark = '<path d="M49 27q9-5 10-13 6 11-2 16z" fill="#ffdc8a"/>'
const star = '<path d="m32 12 4.6 14.7L51 32l-14.4 4.5L32 52l-4.6-15.5L13 32l14.4-5.3z" fill="#a9d8f5" stroke="#dcefff" stroke-width="1.3"/>'
const serpent = '<path d="M12 38c0 11 19 17 26 8 3-4 0-8-7-10-10-3-11-12-5-19 4-5 11-7 18-6l6-4-1 8 6 2-1 5-12 1-5 5c-1 3 4 4 7 7 14 12 1 25-15 24-13-1-21-10-17-21Z" fill="#526eaf" stroke="#b7d7fa" stroke-width="2.3" stroke-linejoin="round"/><path d="m26 17 2-8 4 5m11 3 3-1" fill="none" stroke="#e4d99d" stroke-width="2.2" stroke-linecap="round"/>'
const orbit = '<path d="M5 37c2-6 9-13 17-18m26-7c7-1 11 0 11 3 0 6-12 17-28 24C16 46 5 48 5 44" fill="none" stroke="#a6b7f5" stroke-width="2" stroke-linecap="round"/>'
const corona = '<path d="m48 2 1.5 4 4 1.5-4 1.4-1.5 4-1.4-4-4-1.4 4-1.5zM10 17l1 2.6 2.6 1-2.6 1L10 24l-1-2.4-2.6-1 2.6-1z" fill="#f5db9d"/>'
const ember = '<path d="M32 20c2 6 11 10 11 19a11 11 0 1 1-22 0c0-7 6-11 11-19Z" fill="#8a405c" stroke="#e1a1ad" stroke-width="2.6"/><path d="m32 32 4 8-4 6-4-6z" fill="#ffd1ae"/>'
const soul = '<path d="M35 6c3 13 14 17 15 29 1 12-7 20-18 20-12 0-20-8-19-20 1-6 4-12 7-15l1 9C29 24 32 15 35 6Z" fill="#91405c" stroke="#e29aac" stroke-width="2.4" stroke-linejoin="round"/><path d="M33 28c1 5 8 7 8 14a9 9 0 0 1-18 0c0-5 5-8 10-14Z" fill="#f2ae98"/>'
const twin = '<path d="M9 43c-6-7-2-14 0-19 1 6 6 8 6 13zm43-8c-2-7 4-12 4-17 6 11 4 15-4 21z" fill="#d97e99"/>'
const crown = '<path d="m19 9 5 6 7-11 3 9 8-6" fill="none" stroke="#f1c0a4" stroke-width="2.5" stroke-linecap="round"/>'

export function companionGlyph(pet) {
  let art = lantern
  if (pet?.id === 'smolder') art = pet.stage === 0 ? egg : (pet.stage >= 2 ? wing : '') + hatchling + (pet.stage === 3 ? spark : '')
  if (pet?.id === 'sol') art = pet.stage === 0 ? star : serpent + (pet.stage >= 2 ? orbit : '') + (pet.stage === 3 ? corona : '')
  if (pet?.id === 'harvest') art = pet.stage === 0 ? ember : soul + (pet.stage >= 2 ? twin : '') + (pet.stage === 3 ? crown : '')
  return `<svg class="companion-glyph" viewBox="0 0 64 64" aria-hidden="true">${art}</svg>`
}

export const companionOptions = Object.entries(COMPANIONS).map(([id, pet]) =>
  `<option value="${id}">${pet.fullName}</option>`).join('') + '<option value="lantern">只显示巡灯</option>'

export function companionDetail(profile, tasks) {
  const pet = companionState(profile)
  const progress = pet?.next ? `距「${pet.next[1]}」还差 ${pet.next[0] - pet.layers} 层` : '最终形态 · 层数继续累积'
  const forms = pet ? `<ol class="companion-forms" aria-label="四个成长阶段">${pet.forms.map(([threshold, name], stage) =>
    `<li data-reached="${stage <= pet.stage}" ${stage === pet.stage ? 'aria-current="step"' : ''}>
      ${companionGlyph({ id: pet.id, stage })}<span>${name}</span><small>${threshold} 层</small></li>`).join('')}</ol>` : ''
  return `<div class="companion-display" data-track="${pet?.id ?? 'lantern'}">
    <div class="companion-portrait">${companionGlyph(pet)}</div>
    <div>${pet ? `<div class="companion-stage">${pet.name} · ${pet.form}</div><strong class="companion-count">${pet.layers} <small>层${pet.unit}</small></strong>
      <p>${pet.rule}</p><span class="companion-next">${progress}</span>`
    : '<div class="companion-stage">峡谷巡灯</div><p>可以从上面选一位伙伴，也可以继续带着这盏灯。</p>'}</div>${forms}</div>
    <div class="companion-tasks" aria-label="今日阅读任务">${tasks.map(task => `<span>${taskSeal(task)}${task.label} <b>${task.count}/${task.goal}</b><span class="sr-only">${task.unit}，${task.status === 'done' ? '已完成' : '进行中'}</span></span>`).join('')}</div>
    <p class="companion-hint">三条路线都按已有记录成长。换伙伴或隔几天再读，层数都会保留。</p>`
}
