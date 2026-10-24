/**
 * Signal, emote and mastery-stamp metadata. Existing ping IDs remain stable for
 * previously saved PDF files. Original Riot assets are user-installed only.
 */
export const PING_SIZE = 36
export const EMOTE_SIZE = 48
export const MASTERY_SIZE = 48
export const QUICK_TAP_MS = 350
export const QUICK_TAP_PX = 12

export const WHEEL = { size: 432, cx: 216, cy: 216, inner: 66, outer: 166 }

// Starting at 12 o'clock, clockwise. Keep the legacy ping IDs unchanged.
export const PINGS = [
  { id: 'danger', label: '危险／撤退', color: '#b63b49', ink: '#ffffff', icon: 'pingwheel_retreatrender.png', sound: 'SRP_12.wav', category: 'ping', size: PING_SIZE },
  { id: 'push', label: '推进', color: '#238b65', ink: '#ffffff', icon: 'pingwheel_pushrender.png', sound: 'SRP_9.wav', category: 'ping', size: PING_SIZE },
  { id: 'arrive', label: '正在路上', color: '#2a80bf', ink: '#ffffff', icon: 'omw_cyan.png', sound: 'OnMyWay.wav', category: 'ping', size: PING_SIZE },
  { id: 'allin', label: '全力进攻', color: '#9f7a30', ink: '#ffffff', icon: 'png_all_in.png', sound: 'SRP_4.wav', category: 'ping', size: PING_SIZE },
  { id: 'assist', label: '请求协助', color: '#289466', ink: '#ffffff', icon: 'png_assist_me_128x128.png', sound: 'ComeHere.wav', category: 'ping', size: PING_SIZE },
  { id: 'needvision', label: '需要视野', color: '#399179', ink: '#ffffff', icon: 'mt11_18_vision.png', sound: 'SRP_7.wav', category: 'ping', size: PING_SIZE },
  { id: 'question', label: '敌人不见了', color: '#b18a36', ink: '#ffffff', icon: 'png_enemymissing_128x128.png', sound: 'MIA.wav', category: 'ping', size: PING_SIZE },
  { id: 'enemyvision', label: '敌方有视野', color: '#ad455d', ink: '#ffffff', icon: 'pingwheel_enemyvisionrender.png', sound: 'AreaIsWarded.wav', category: 'ping', size: PING_SIZE },
  { id: 'caution', label: '普通标记', color: '#2c70aa', ink: '#ffffff', icon: 'pingwheel_basicpingrender.png', sound: 'Base.wav', category: 'ping', size: PING_SIZE },
]
export const WHEEL_PINGS = PINGS.filter((p) => p.id !== 'caution')

// Default nine-slot emote wheel: T taps the center emote; hold T and drag to
// choose one of the eight outer emotes. Users may replace these assets locally.
export const EMOTES = [
  { id: 'emote_thumb', label: '点赞', emoji: '👍', color: '#4d5360', ink: '#ffffff', icon: 'thumb_happy_up_inventory.png', category: 'emote', size: EMOTE_SIZE },
  { id: 'emote_cupcake', label: '开心', emoji: '🧁', color: '#a25f83', ink: '#ffffff', icon: 'cupcake_happy_smiling_inventory.png', category: 'emote', size: EMOTE_SIZE },
  { id: 'emote_bee_angry', label: '生气蜜蜂', emoji: '🐝', color: '#b88a26', ink: '#ffffff', icon: 'em_bee_angry_inventory.png', category: 'emote', size: EMOTE_SIZE },
  { id: 'emote_bee_happy', label: '开心蜜蜂', emoji: '🐝', color: '#b88a26', ink: '#ffffff', icon: 'em_bee_happy_inventory.png', category: 'emote', size: EMOTE_SIZE },
  { id: 'emote_bee_sad', label: '难过蜜蜂', emoji: '🐝', color: '#b88a26', ink: '#ffffff', icon: 'em_bee_sad_inventory.png', category: 'emote', size: EMOTE_SIZE },
  { id: 'emote_pengu_blue', label: '蓝色企鹅', emoji: '🐧', color: '#4b77a5', ink: '#ffffff', icon: 'em_hype_pengu_blue_inventory.png', category: 'emote', size: EMOTE_SIZE },
  { id: 'emote_pengu_orange', label: '橙色企鹅', emoji: '🐧', color: '#b56e32', ink: '#ffffff', icon: 'em_hype_pengu_orange_inventory.png', category: 'emote', size: EMOTE_SIZE },
  { id: 'emote_minion_shy', label: '害羞小兵', emoji: '🙈', color: '#8d7b58', ink: '#ffffff', icon: 'em_minion_shy_inventory.png', category: 'emote', size: EMOTE_SIZE },
  { id: 'emote_penguin_dab', label: '企鹅 DAB', emoji: '🐧', color: '#4b77a5', ink: '#ffffff', icon: 'penguin_meme_dab_inventory.png', category: 'emote', size: EMOTE_SIZE },
]
export const EMOTE_CENTER = EMOTES[0]
export const WHEEL_EMOTES = EMOTES.slice(1)

export const MASTERY = {
  id: 'mastery', label: '亮牌／成就表情', emoji: '★', color: '#b48b39', ink: '#fff6d6',
  icon: 'mastery_icon_7.png', category: 'mastery', size: MASTERY_SIZE,
}
// Notes are generated locally from user text; they do not need a downloaded game asset.
export const NOTE = { id: 'note', label: '备注', color: '#fff2c9', ink: '#202733', category: 'note', size: 220 }
export const NOTE_MAX_CHARS = 300
export const STAMP_TYPES = [...PINGS, ...EMOTES, MASTERY]

function noteCharUnits(char) {
  if (/\s/u.test(char)) return 0.32
  if (/[\u2e80-\u9fff\uf900-\ufaff\u{20000}-\u{2ffff}]/u.test(char)) return 1
  return 0.55
}

export function wrapNoteText(text, maxUnits = 20) {
  const normalized = String(text ?? '').replace(/\r\n?/g, '\n').slice(0, NOTE_MAX_CHARS)
  const lines = []
  for (const paragraph of normalized.split('\n')) {
    if (!paragraph) { lines.push(''); continue }
    let line = ''
    let units = 0
    for (const char of Array.from(paragraph)) {
      const weight = noteCharUnits(char)
      if (line && units + weight > maxUnits) {
        lines.push(line)
        line = char
        units = weight
      } else {
        line += char
        units += weight
      }
    }
    lines.push(line)
  }
  return lines.slice(0, 18)
}

export function noteLayout(text) {
  const lines = wrapNoteText(text)
  const maxUnits = Math.max(0, ...lines.map((line) => Array.from(line).reduce((sum, char) => sum + noteCharUnits(char), 0)))
  const width = Math.max(150, Math.min(300, Math.ceil(maxUnits * 13 + 24)))
  const height = Math.max(42, Math.min(360, lines.length * 18 + 24))
  return { width, height, lines }
}

function escapeXml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\"/g, '&quot;').replace(/'/g, '&apos;')
}

export function noteSvg(note) {
  const layout = noteLayout(note.text)
  const width = Number.isFinite(note.width) ? note.width : layout.width
  const height = Number.isFinite(note.height) ? note.height : layout.height
  const lines = wrapNoteText(note.text)
  const text = lines.map((line, i) => `<text x="13" y="${17 + i * 18}" font-size="12.5" font-family="Segoe UI, Microsoft YaHei, Noto Sans SC, sans-serif" fill="#202733">${escapeXml(line)}</text>`).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width * 2}" height="${height * 2}" viewBox="0 0 ${width} ${height}"><rect x="0.75" y="0.75" width="${width - 1.5}" height="${height - 1.5}" rx="7" fill="#fff2c9" stroke="#b58c39" stroke-width="1.5"/><rect x="1.5" y="1.5" width="4" height="${height - 3}" rx="2" fill="#d7b65b"/>${text}</svg>`
}

const MARKS = {
  question: (ink) => `<path d="M21 26.5c0-8 5.4-13.2 11.4-13.2 6.4 0 10.8 4.2 10.8 9.8 0 5.4-3.4 7.8-7.2 10-2.6 1.5-4 3-4 6" fill="none" stroke="${ink}" stroke-width="5.6" stroke-linecap="round"/><circle cx="32" cy="49" r="3.6" fill="${ink}"/>`,
  caution: (ink) => `<circle cx="32" cy="32" r="7" fill="${ink}"/><path d="M32 12V21M32 43V52M12 32H21M43 32H52" stroke="${ink}" stroke-width="4" stroke-linecap="round"/>`,
  danger: (ink) => `<path d="M32 12 52 50H12Z" fill="none" stroke="${ink}" stroke-width="4" stroke-linejoin="round"/><path d="M32 26V39" stroke="${ink}" stroke-width="5" stroke-linecap="round"/><circle cx="32" cy="45" r="3" fill="${ink}"/>`,
  arrive: (ink) => `<path d="M12 46h19c8 0 11-8 17-14" fill="none" stroke="${ink}" stroke-width="6" stroke-linecap="round"/><path d="M37 16 54 22 39 37Z" fill="${ink}"/>`,
  assist: (ink) => `<path d="M32 13V51M13 32H51" stroke="${ink}" stroke-width="7.2" stroke-linecap="round"/>`,
  push: (ink) => `<path d="M32 12V50M20 26L32 12 44 26M20 39L32 25 44 39" fill="none" stroke="${ink}" stroke-width="5.6" stroke-linecap="round" stroke-linejoin="round"/>`,
  allin: (ink) => `<path d="M11 33H51M37 19L51 33 37 47" fill="none" stroke="${ink}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`,
  needvision: (ink) => `<path d="M9 32Q32 10 55 32Q32 54 9 32Z" fill="none" stroke="${ink}" stroke-width="4"/><circle cx="32" cy="32" r="8" fill="${ink}"/>`,
  enemyvision: (ink) => `<path d="M9 32Q32 10 55 32Q32 54 9 32Z" fill="none" stroke="${ink}" stroke-width="4"/><path d="M15 15L49 49" stroke="${ink}" stroke-width="5" stroke-linecap="round"/>`,
}

export function pingById(id) { return STAMP_TYPES.find((p) => p.id === id) || (id === NOTE.id ? NOTE : null) }
export function stampSize(pingOrId) {
  const spec = typeof pingOrId === 'string' ? pingById(pingOrId) : pingOrId
  return spec?.size || PING_SIZE
}
export function pingMark(ping) { return MARKS[ping.id]?.(ping.ink) || '' }
export function pingBadgeSvg(ping, px = 64) {
  if (ping.category === 'emote') {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${px}" height="${px}" aria-hidden="true"><circle cx="32" cy="32" r="30" fill="${ping.color}"/><text x="32" y="43" text-anchor="middle" font-size="35">${ping.emoji || '★'}</text></svg>`
  }
  if (ping.category === 'mastery') {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${px}" height="${px}" aria-hidden="true"><path d="M32 3 54 12 58 31 47 52 32 61 17 52 6 31 10 12Z" fill="#5d451d" stroke="#d9b65b" stroke-width="3"/><path d="M32 10 48 17 51 31 42 46 32 53 22 46 13 31 16 17Z" fill="#9e782d" stroke="#f1d48a" stroke-width="2"/><text x="32" y="40" text-anchor="middle" font-size="28" font-weight="700" fill="#fff0bd">★</text></svg>`
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${px}" height="${px}" aria-hidden="true"><circle cx="32" cy="32" r="30" fill="${ping.color}"/>${pingMark(ping)}</svg>`
}
