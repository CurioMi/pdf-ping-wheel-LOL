/**
 * Optional Riot assets are installed locally by the user. No network requests
 * are made by the extension at runtime; SVG/emoji fallbacks remain available.
 */
import { PINGS, EMOTES, MASTERY, STAMP_TYPES, pingBadgeSvg } from './pings.js'

const icons = new Map()
const sounds = new Set()
const pngBytes = new Map()

export function iconUrl(stamp) {
  const spec = typeof stamp === 'string' ? STAMP_TYPES.find((item) => item.id === stamp) : stamp
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
    return `<img class="${stamp.category === 'emote' ? 'emote-art' : 'ping-art'}" width="${px}" height="${px}" src="${iconUrl(stamp)}" alt="" draggable="false">`
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

export async function initializePingAssets() {
  await Promise.all(STAMP_TYPES.map(async (stamp) => {
    try {
      const bytes = await localBytes(iconUrl(stamp))
      if (isPng(bytes)) {
        pngBytes.set(stamp.id, bytes)
        icons.set(stamp.id, true)
      }
    } catch { /* Missing or unsupported local asset; fallback SVG/emoji. */ }
  }))
  await Promise.all(PINGS.map(async (ping) => {
    try {
      if (isWav(await localBytes(soundUrl(ping)))) sounds.add(ping.id)
    } catch { /* Local WAV unavailable; synthesized tone fallback. */ }
  }))
  return {
    icons: icons.size,
    pings: PINGS.filter((p) => icons.has(p.id)).length,
    emotes: EMOTES.filter((p) => icons.has(p.id)).length,
    mastery: icons.has(MASTERY.id) ? 1 : 0,
    sounds: sounds.size,
    total: STAMP_TYPES.length,
  }
}
