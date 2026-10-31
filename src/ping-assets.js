/**
 * Optional Riot assets are installed locally by the user. No network requests
 * are made by the extension at runtime; SVG/emoji fallbacks remain available.
 */
import { PINGS, EMOTES, ALL_EMOTES, MASTERY, pingById, pingBadgeSvg } from './pings.js'

const icons = new Map()
const sounds = new Set()
const pngBytes = new Map()
const pendingPng = new Map()

export function iconUrl(stamp) {
  const spec = typeof stamp === 'string' ? pingById(stamp) : stamp
  if (!spec) return ''
  if (spec.category === 'emote') return `./riot/emotes/${spec.icon}`
  if (spec.category === 'mastery') return `./riot/mastery/${spec.icon}`
  return `./riot/textures/${spec.icon}`
}
export function soundUrl(ping) { return `./riot/sounds/${ping.sound}` }
export function hasIcon(type) { return icons.has(type) }
export function hasSound(type) { return sounds.has(type) }
export function originalPng(type) { return pngBytes.get(type) || null }

export function iconMarkup(stamp, px = 64) {
  if (hasIcon(stamp.id)) {
    return `<img class="${stamp.category === 'emote' ? 'emote-art' : 'ping-art'}" width="${px}" height="${px}" src="${iconUrl(stamp)}" alt="" draggable="false" loading="lazy">`
  }
  return pingBadgeSvg(stamp, px)
}

export function wheelIconMarkup(stamp, x, y, size) {
  if (hasIcon(stamp.id)) {
    return `<image class="slice-art" href="${iconUrl(stamp)}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet"/>`
  }
  const scale = size / 64
  return `<g transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${scale.toFixed(5)})">${pingBadgeSvg(stamp)}</g>`
}

function isPng(bytes) {
  return bytes.length > 64 && [137,80,78,71,13,10,26,10].every((n, i) => bytes[i] === n)
}
function isWav(bytes) {
  return bytes.length > 44 && String.fromCharCode(...bytes.slice(0,4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8,12)) === 'WAVE'
}
async function localBytes(url) {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`)
  return new Uint8Array(await res.arrayBuffer())
}

export async function ensureOriginalPng(type) {
  if (pngBytes.has(type)) return pngBytes.get(type)
  if (!hasIcon(type)) return null
  if (!pendingPng.has(type)) pendingPng.set(type, (async () => {
    try {
      const bytes = await localBytes(iconUrl(type))
      if (!isPng(bytes)) throw new Error('Invalid local emote image')
      // Thousands of emotes are available; only recently used images need raw bytes in memory.
      if (pngBytes.size >= 64) pngBytes.delete(pngBytes.keys().next().value)
      pngBytes.set(type, bytes)
      return bytes
    } catch { icons.delete(type); return null }
    finally { pendingPng.delete(type) }
  })())
  return pendingPng.get(type)
}

export async function initializePingAssets() {
  await Promise.all([...PINGS, ...EMOTES, MASTERY].map(async (stamp) => {
    try {
      const bytes = await localBytes(iconUrl(stamp))
      if (isPng(bytes)) {
        pngBytes.set(stamp.id, bytes)
        icons.set(stamp.id, true)
      }
    } catch { /* Missing or unsupported local asset; fallback SVG/emoji. */ }
  }))
  try {
    const response = await fetch('./riot/emotes/catalog-index.json')
    if (response.ok) {
      const index = await response.json()
      for (const id of index.ids || []) if (pingById(id)?.category === 'emote') icons.set(id, true)
    }
  } catch { /* Source-only builds keep usable starter fallbacks. */ }
  await Promise.all(PINGS.map(async (ping) => {
    try {
      if (isWav(await localBytes(soundUrl(ping)))) sounds.add(ping.id)
    } catch { /* Local WAV unavailable; synthesized tone fallback. */ }
  }))
  return {
    icons: icons.size,
    pings: PINGS.filter((p) => icons.has(p.id)).length,
    emotes: ALL_EMOTES.filter((p) => icons.has(p.id)).length,
    mastery: icons.has(MASTERY.id) ? 1 : 0,
    sounds: sounds.size,
    total: PINGS.length + ALL_EMOTES.length + 1,
  }
}
