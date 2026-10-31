import { ALL_EMOTES, EMOTES, pingById } from './pings.js'

export const PROFILE_KEY = 'pdf-ping-wheel:loot:v1'
export const EMOTE_COST = 100
export const LEVEL_XP = 200
export const STARTER_IDS = EMOTES.map(e => e.id)
const validEmotes = new Set(ALL_EMOTES.map(e => e.id))
const finiteInt = value => Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
const unique = values => [...new Set(Array.isArray(values) ? values.filter(v => typeof v === 'string') : [])]

export function dayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function newProfile() {
  return {
    version: 1, mode: 'quest', essence: 300, chests: 1, xp: 0,
    owned: [...STARTER_IDS], wheel: [...STARTER_IDS], favorites: [],
    totalMs: 0, noteReceipts: [], noteHashes: [], activeDays: [],
    days: {}, milestones: [], pending: [], lastReadAt: 0,
  }
}

export function normalizeProfile(raw) {
  if (!raw || raw.version !== 1) throw new Error('不支持的存档版本')
  const p = newProfile()
  for (const key of ['essence', 'chests', 'xp', 'totalMs', 'lastReadAt']) p[key] = finiteInt(raw[key])
  p.mode = raw.mode === 'free' ? 'free' : 'quest'
  p.owned = unique([...STARTER_IDS, ...unique(raw.owned)]) // Keep IDs from newer catalogs when importing older builds.
  p.favorites = unique(raw.favorites)
  p.noteReceipts = unique(raw.noteReceipts)
  p.noteHashes = unique(raw.noteHashes)
  p.activeDays = unique(raw.activeDays).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))
  p.milestones = unique(raw.milestones)
  p.pending = unique(raw.pending).filter(id => validEmotes.has(id)).slice(0, 3)
  if (raw.days && typeof raw.days === 'object' && !Array.isArray(raw.days)) {
    for (const [date, day] of Object.entries(raw.days)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !day || typeof day !== 'object') continue
      p.days[date] = { ms: finiteInt(day.ms), pages: unique(day.pages), notes: finiteInt(day.notes), claimed: unique(day.claimed) }
    }
  }
  p.wheel = usableWheel({ ...p, wheel: Array.isArray(raw.wheel) ? raw.wheel : STARTER_IDS })
  return p
}

export function ownedEmote(p, id) { return p.owned.includes(id) }
export function canEquip(p, id) { return validEmotes.has(id) && (p.mode === 'free' || ownedEmote(p, id)) }
export function usableWheel(p) {
  const used = new Set()
  return STARTER_IDS.map((fallback, slot) => {
    let id = p.wheel?.[slot]
    if (!canEquip(p, id) || used.has(id)) id = [fallback, ...STARTER_IDS].find(candidate => !used.has(candidate))
    used.add(id)
    return id
  })
}

export function equipEmote(p, id, slot) {
  if (!canEquip(p, id) || !Number.isInteger(slot) || slot < 0 || slot > 8) throw new Error('请先解锁表情并选择轮盘位置')
  p.wheel = usableWheel(p)
  const other = p.wheel.indexOf(id)
  if (other !== -1) p.wheel[other] = p.wheel[slot]
  p.wheel[slot] = id
}

export function unlockEmote(p, id) {
  if (!validEmotes.has(id)) throw new Error('表情不存在')
  if (ownedEmote(p, id)) return false
  if (p.essence < EMOTE_COST) throw new Error('研究精粹不足，完成阅读任务即可获得')
  p.essence -= EMOTE_COST
  p.owned.push(id)
  return true
}

export function openChest(p, random = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32) {
  if (p.pending.length) return p.pending
  if (p.chests < 1) throw new Error('还没有宝箱，完成任务或升级后再来')
  const owned = new Set(p.owned)
  const pool = ALL_EMOTES.map(e => e.id).filter(id => !owned.has(id))
  if (!pool.length) throw new Error('你已拥有全部表情，宝箱会保留到下一次表情库更新')
  p.chests--
  while (p.pending.length < 3 && pool.length) {
    const index = Math.min(pool.length - 1, Math.floor(Math.max(0, random()) * pool.length))
    p.pending.push(pool.splice(index, 1)[0])
  }
  return p.pending
}

export function claimChest(p, id) {
  if (!p.pending.includes(id)) throw new Error('请选择本次宝箱中的表情')
  if (!ownedEmote(p, id)) p.owned.push(id)
  else p.essence += EMOTE_COST // A different tab may have unlocked this choice in the meantime.
  p.pending = []
}

export const DAILY_QUESTS = [
  { id: 'first-win', title: '每日首胜', description: '今天有效阅读 10 分钟', metric: 'minutes', goal: 10, xp: 50, essence: 50, chests: 0 },
  { id: 'deep-focus', title: '专注推塔', description: '今天累计有效阅读 25 分钟', metric: 'minutes', goal: 25, xp: 100, essence: 0, chests: 1 },
  { id: 'vision', title: '布置视野', description: '在 3 个不同页面留下新标记，并保存 PDF', metric: 'pages', goal: 3, xp: 50, essence: 50, chests: 0 },
  { id: 'insight', title: '洞察之眼', description: '写下 3 条不同的有效笔记，并保存 PDF', metric: 'notes', goal: 3, xp: 100, essence: 100, chests: 0 },
]
export const MILESTONE_QUESTS = [
  { id: 'hour', title: '初探峡谷', description: '累计有效阅读 60 分钟', metric: 'totalMinutes', goal: 60, xp: 150, essence: 100, chests: 1 },
  { id: 'five-hours', title: '学术先锋', description: '累计有效阅读 300 分钟', metric: 'totalMinutes', goal: 300, xp: 300, essence: 200, chests: 2 },
  { id: 'ten-notes', title: '思考的力量', description: '累计保存 10 条不同的有效笔记', metric: 'totalNotes', goal: 10, xp: 150, essence: 100, chests: 1 },
  { id: 'three-days', title: '再次集结', description: '累计 3 天，每天有效阅读至少 10 分钟', metric: 'days', goal: 3, xp: 200, essence: 100, chests: 1 },
  { id: 'seven-days', title: '峡谷学者', description: '累计 7 天，每天有效阅读至少 10 分钟', metric: 'days', goal: 7, xp: 300, essence: 200, chests: 2 },
]

function ensureDay(p, key) {
  return p.days[key] ||= { ms: 0, pages: [], notes: 0, claimed: [] }
}

export function questProgress(p, quest, key = dayKey()) {
  const day = p.days[key] || { ms: 0, pages: [], notes: 0, claimed: [] }
  const metrics = { minutes: day.ms / 60000, pages: day.pages.length, notes: day.notes,
    totalMinutes: p.totalMs / 60000, totalNotes: p.noteHashes.length, days: p.activeDays.length }
  return { value: Math.min(quest.goal, metrics[quest.metric] || 0),
    claimed: (quest.metric.startsWith('total') || quest.metric === 'days' ? p.milestones : day.claimed).includes(quest.id) }
}

function reward(p, quest) {
  const before = Math.floor(p.xp / LEVEL_XP)
  p.xp += quest.xp
  p.essence += quest.essence
  p.chests += quest.chests + Math.floor(p.xp / LEVEL_XP) - before
}

export function grantCompleted(p, key = dayKey()) {
  const day = ensureDay(p, key), completed = []
  if (day.ms >= 600000 && !p.activeDays.includes(key)) p.activeDays.push(key)
  for (const [quests, claimed] of [[DAILY_QUESTS, day.claimed], [MILESTONE_QUESTS, p.milestones]]) {
    for (const q of quests) if (!claimed.includes(q.id) && questProgress(p, q, key).value >= q.goal) {
      claimed.push(q.id); reward(p, q); completed.push(q.title)
    }
  }
  return completed
}

export function recordReading(p, ms, at = Date.now()) {
  // Reject sleep jumps, clock rollback and overlapping ticks from another viewer tab.
  if (!Number.isFinite(ms) || ms <= 0 || ms > 15000 || !Number.isFinite(at) || at <= p.lastReadAt) return []
  const credited = Math.min(ms, p.lastReadAt ? at - p.lastReadAt : ms)
  p.lastReadAt = at
  const key = dayKey(new Date(at)), day = ensureDay(p, key)
  day.ms += credited
  p.totalMs += credited
  return grantCompleted(p, key)
}

export function qualifyingNote(text) {
  const normalized = String(text || '').normalize('NFKC').replace(/\s+/gu, '')
  return Array.from(normalized).length >= 12 && new Set(normalized).size >= 4
}

// Only newly created marks still present in a successfully exported PDF are passed here.
// Hashes and IDs are stored, never note text or filenames.
export function recordSavedMarks(p, documentId, marks, key = dayKey()) {
  if (!/^[a-f0-9]{64}$/.test(documentId)) return []
  const day = ensureDay(p, key)
  for (const mark of marks) {
    if (!Number.isInteger(mark.page) || mark.page < 0 || !mark.id) continue
    const page = `${documentId}:${mark.page}`
    if (!day.pages.includes(page)) day.pages.push(page)
    if (mark.noteHash && /^[a-f0-9]{64}$/.test(mark.noteHash) && !p.noteReceipts.includes(mark.id) && !p.noteHashes.includes(mark.noteHash)) {
      p.noteReceipts.push(mark.id)
      p.noteHashes.push(mark.noteHash)
      day.notes++
    }
  }
  return grantCompleted(p, key)
}

export function createReadingClock() {
  let previous = null, lastInput = -Infinity
  return {
    activity(now) { lastInput = now },
    reset() { previous = null },
    tick(now, active) {
      const elapsed = previous === null ? 0 : now - previous
      previous = active && now - lastInput <= 120000 ? now : null
      return previous !== null && elapsed > 0 && elapsed <= 15000 ? elapsed : 0
    },
  }
}

export function createProfileStore({ storage = localStorage, locks = navigator.locks, onChange = () => {}, onError = () => {} } = {}) {
  let current, broken = false
  const read = () => {
    const raw = storage.getItem(PROFILE_KEY)
    return raw === null ? newProfile() : normalizeProfile(JSON.parse(raw))
  }
  try { current = read() } catch (error) { current = newProfile(); broken = true; queueMicrotask(() => onError(error)) }
  let queue = Promise.resolve()
  async function mutate(action) {
    const run = async () => {
      if (broken) throw new Error('战利品存档无法读取；请先导出备份，或导入有效备份恢复')
      const next = read()
      const result = await action(next)
      storage.setItem(PROFILE_KEY, JSON.stringify(next))
      current = next
      onChange(current)
      return result
    }
    const job = queue.then(() => locks ? locks.request(PROFILE_KEY, run) : run())
    queue = job.catch(() => {})
    return job
  }
  return {
    get: () => current,
    mutate,
    refresh() { try { current = read(); broken = false; onChange(current) } catch (error) { broken = true; onError(error) } },
    async restore(raw) {
      const next = normalizeProfile(raw)
      const run = () => { storage.setItem(PROFILE_KEY, JSON.stringify(next)); current = next; broken = false; onChange(current) }
      await queue
      return locks ? locks.request(PROFILE_KEY, run) : run()
    },
    export: () => storage.getItem(PROFILE_KEY) || JSON.stringify(current),
  }
}

export function wheelSpecs(profile) { return usableWheel(profile).map(pingById) }
