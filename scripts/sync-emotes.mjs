// Build-time only. The installed extension never contacts CommunityDragon.
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises'
import { dirname } from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const base = 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/'
const catalogPath = new URL('../src/emote-catalog.json', import.meta.url)
const assetRoot = new URL('../public/riot/emotes/', import.meta.url)
const legacy = {
  'thumb_happy_up_inventory.png': 'emote_thumb',
  'cupcake_happy_smiling_inventory.png': 'emote_cupcake',
  'em_bee_angry_inventory.png': 'emote_bee_angry',
  'em_bee_happy_inventory.png': 'emote_bee_happy',
  'em_bee_sad_inventory.png': 'emote_bee_sad',
  'em_hype_pengu_blue_inventory.png': 'emote_pengu_blue',
  'em_hype_pengu_orange_inventory.png': 'emote_pengu_orange',
  'em_minion_shy_inventory.png': 'emote_minion_shy',
  'penguin_meme_dab_inventory.png': 'emote_penguin_dab',
}

async function request(url) {
  let error
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(30000) })
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`)
      return Buffer.from(await response.arrayBuffer())
    } catch (e) { error = e }
  }
  throw error
}

let catalog
if (process.argv.includes('--download-only')) {
  catalog = JSON.parse(await readFile(catalogPath, 'utf8'))
} else {
  const cached = process.argv.includes('--from-cache')
  const [zhBytes, enBytes] = await Promise.all(cached
    ? ['zh', 'en'].map(lang => readFile(new URL(`../work/emotes-${lang}.json`, import.meta.url)))
    : ['zh_cn', 'default'].map(locale => request(`${base}${locale}/v1/summoner-emotes.json`)))
  const zh = JSON.parse(zhBytes), en = new Map(JSON.parse(enBytes).map(row => [row.id, row]))
  const entries = zh.filter(row => row.id > 0 && row.name && /\.png$/i.test(row.inventoryIcon) && !/\/templates\//i.test(row.inventoryIcon))
    .map(row => {
      const assetPath = row.inventoryIcon.replace(/^\/lol-game-data\/assets\//i, '').toLowerCase()
      if (!/^assets\/[a-z0-9_./-]+\.png$/.test(assetPath) || assetPath.includes('..')) throw new Error(`Unsafe asset path: ${assetPath}`)
      const filename = assetPath.split('/').at(-1)
      return {
        id: legacy[filename] || `emote_riot_${row.id}`, riotId: row.id,
        label: row.name, englishName: en.get(row.id)?.name || '',
        icon: legacy[filename] ? filename : `catalog/${row.id}.png`, assetPath,
        collection: assetPath.includes('/tft/') ? 'TFT' : 'LOL',
      }
    }).sort((a, b) => a.riotId - b.riotId)
  if (entries.length < 100 || new Set(entries.map(e => e.id)).size !== entries.length) throw new Error('Unexpected or duplicate emote catalog')
  for (const id of Object.values(legacy)) if (!entries.some(e => e.id === id)) throw new Error(`Missing starter emote: ${id}`)
  catalog = {
    version: 1, updatedAt: new Date().toISOString().slice(0, 10),
    source: `${base}zh_cn/v1/summoner-emotes.json`,
    sourceSha256: createHash('sha256').update(zhBytes).digest('hex'),
    sourceCount: zh.length, excludedCount: zh.length - entries.length, entries,
  }
  await writeFile(catalogPath, JSON.stringify(catalog, null, 2) + '\n')
  console.log(`Catalog: ${entries.length} emotes; ${catalog.excludedCount} empty/template records excluded.`)
}

if (!process.argv.includes('--catalog-only')) {
  const png = bytes => bytes.length > 64 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
  let cursor = 0, completed = 0
  const failures = []
  await Promise.all(Array.from({ length: 12 }, async () => {
    while (cursor < catalog.entries.length) {
      const entry = catalog.entries[cursor++]
      const dest = new URL(entry.icon, assetRoot)
      try {
        let bytes = await readFile(dest).catch(() => null)
        if (!bytes || !png(bytes)) {
          bytes = await request(`${base}default/${entry.assetPath}`)
          if (!png(bytes)) throw new Error(`Invalid PNG: ${entry.id}`)
          await mkdir(dirname(fileURLToPath(dest)), { recursive: true })
          await writeFile(new URL(`${entry.icon}.tmp`, assetRoot), bytes)
          await rename(new URL(`${entry.icon}.tmp`, assetRoot), dest)
        }
        completed++
        if (completed % 200 === 0) console.log(`Validated ${completed}/${catalog.entries.length} emotes`)
      } catch (error) { failures.push({ id: entry.id, message: error.message }) }
    }
  }))
  if (failures.length) {
    console.error(failures)
    throw new Error(`${failures.length} emotes failed; no complete catalog index was published. Retry to resume.`)
  }
  await writeFile(new URL('catalog-index.json', assetRoot), JSON.stringify({ ids: catalog.entries.map(e => e.id), updatedAt: catalog.updatedAt }))
  console.log(`Complete local asset pack: ${completed} emotes. Runtime is offline.`)
}
