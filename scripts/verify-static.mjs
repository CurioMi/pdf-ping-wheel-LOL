import { strict as assert } from 'node:assert'
import { readFile, access, readdir } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PINGS, WHEEL_PINGS, EMOTES, WHEEL_EMOTES, MASTERY, NOTE, STAMP_TYPES, pingById, pingBadgeSvg, noteLayout, noteSvg } from '../src/pings.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const ids = new Set(STAMP_TYPES.map((stamp) => stamp.id))
assert.equal(PINGS.length, 9)
assert.equal(WHEEL_PINGS.length, 8)
assert.equal(EMOTES.length, 9)
assert.equal(WHEEL_EMOTES.length, 8)
assert.equal(STAMP_TYPES.length, 19)
assert.equal(ids.size, STAMP_TYPES.length)
assert.deepEqual(WHEEL_PINGS.map((p) => p.id),
  ['danger','push','arrive','allin','assist','needvision','question','enemyvision'])
assert.deepEqual(WHEEL_EMOTES.map((p) => p.id),
  ['emote_cupcake','emote_bee_angry','emote_bee_happy','emote_bee_sad','emote_pengu_blue','emote_pengu_orange','emote_minion_shy','emote_penguin_dab'])
assert.equal(MASTERY.id, 'mastery')
assert.equal(NOTE.id, 'note')
assert.equal(pingById(NOTE.id), NOTE)
assert(noteLayout('请检查这一处备注').width >= 150)
assert(noteSvg({text:'备注内容', width:180, height:42}).includes('备注内容'))
assert.deepEqual(['question','caution','danger','arrive','assist'].every((id) => ids.has(id)), true)
for (const p of STAMP_TYPES) {
  assert(p.icon.endsWith('.png'))
  assert(pingBadgeSvg(p).startsWith('<svg'))
  assert.equal(pingById(p.id),p)
}
const code = await readFile(join(dist,'assets/viewer.js'),'utf8')
const sourceCode = await readFile(join(root,'src','viewer.js'),'utf8')
const css = await readFile(join(dist,'assets/viewer.css'),'utf8')
const html = await readFile(join(dist,'viewer.html'),'utf8')
const manifest = JSON.parse(await readFile(join(dist,'manifest.json'),'utf8'))
const map = JSON.parse(await readFile(join(dist,'riot/ASSET_MAP.json'),'utf8'))
assert.equal(manifest.version, '1.5.2')
assert.equal(map.filter((x) => x.category === 'ping').length, 9)
assert.equal(map.filter((x) => x.category === 'emote').length, 9)
assert.equal(map.filter((x) => x.category === 'mastery').length, 1)
const masteryAsset = map.find((x) => x.id === 'mastery')
assert.equal(masteryAsset.file_image, 'mastery_icon_7.png')
assert(map.every((x) => !('url_image' in x) && !('url_audio' in x)), 'public asset map must not publish third-party asset download URLs')
// The public source repository intentionally contains no game-asset downloader scripts.
for (const path of ['install_riot_assets.ps1', 'install_riot_assets.sh', '安装原版素材.cmd']) {
  await assert.rejects(access(join(root, path)), `${path} must not be shipped in the public source repository`)
}
for (const p of PINGS) {
  const m=map.find((x)=>x.id===p.id)
  assert(m && m.file_image===p.icon && m.file_audio===p.sound, `map mismatch: ${p.id}`)
}
for (const p of EMOTES) {
  const m=map.find((x)=>x.id===p.id)
  assert(m && m.file_image===p.icon && m.category==='emote', `emote map mismatch: ${p.id}`)
}
assert(sourceCode.includes('initializePingAssets'))
assert(sourceCode.includes('originalPng(type)'))
assert(sourceCode.includes("event.key.toLowerCase() === 'g'"))
assert(sourceCode.includes("event.key.toLowerCase() === 'v'"))
assert(sourceCode.includes("event.key.toLowerCase() === 'h'"))
assert(sourceCode.includes('event.ctrlKey && event.button === 0'))
assert(sourceCode.includes("event.key.toLowerCase() === 't'"))
assert(sourceCode.includes('MASTERY.id'))
assert(sourceCode.includes('new Audio(soundUrl(spec))'))
assert(sourceCode.includes('PDFPingWheel'))
assert(sourceCode.includes("Subtype: 'Stamp'"), 'native Stamp annotation output missing')
assert(sourceCode.includes('stripPluginArtifacts'), 'native/legacy cleanup missing')
assert(sourceCode.includes('readPingAnnotations'), 'native annotation readback missing')
assert(sourceCode.includes('WHEEL_EMOTES'))
assert(!sourceCode.includes('https://raw.communitydragon.org') && !code.includes('https://raw.communitydragon.org'), 'Remote runtime asset loading is forbidden')
assert(css.includes('.emote-art') && html.includes('asset-status') && html.includes('mastery'))
assert(html.includes('id="chat-composer"') && html.includes('id="chat-input"') && html.includes('chat-toggle'))
assert(css.includes('.chat-composer') && css.includes('.note-stamp'))
assert(sourceCode.includes('openChatComposer') && sourceCode.includes('submitChatNote') && sourceCode.includes('noteSvg'))
assert(sourceCode.includes("event.key === 'Enter'"), 'Enter must open the chat-like note composer')
assert.equal((await readdir(join(dist,'riot/textures'))).filter(x=>x.endsWith('.png')).length,0,
  'No Riot ping images may ship in public release')
assert.equal((await readdir(join(dist,'riot/sounds'))).filter(x=>x.endsWith('.wav')).length,0,
  'No Riot ping sounds may ship in public release')
assert.equal((await readdir(join(dist,'riot/emotes'))).filter(x=>x.endsWith('.png')).length,0,
  'No Riot emotes may ship in public release')
assert.equal((await readdir(join(dist,'riot/mastery'))).filter(x=>x.endsWith('.png')).length,0,
  'No Riot mastery image may ship in public release')
for (const path of ['pdf.worker.min.mjs','cmaps','standard_fonts','licenses/pdfjs-LICENSE','licenses/pdf-lib-LICENSE.md']) await access(join(dist,path))
for (const file of ['src/pings.js','src/ping-assets.js','src/viewer.js','src/pdf-io.js','dist/assets/viewer.js']) {
  const result=spawnSync('node',['--check',join(root,file)], {encoding:'utf8'})
  assert.equal(result.status,0,`${file}: ${result.stderr}`)
}
console.log('PASS: native LoL-style shortcuts; chat-like Enter notes; 9 pings + 9 emotes + mastery; PDF metadata portability; local-only assets; syntax')
