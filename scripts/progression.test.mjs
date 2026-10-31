import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ALL_EMOTES, EMOTES } from '../src/pings.js'
import {
  newProfile, normalizeProfile, usableWheel, equipEmote, unlockEmote, openChest, claimChest,
  recordReading, recordSavedMarks, qualifyingNote, grantCompleted, createReadingClock,
  createProfileStore, PROFILE_KEY, dayKey,
} from '../src/progression.js'

const extra = ALL_EMOTES.filter(e => !EMOTES.some(s => s.id === e.id))
const doc = 'a'.repeat(64)
const time = new Date(2026, 9, 31, 12).getTime()
function memoryStorage() {
  const values = new Map()
  return { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) }
}

test('catalog has unique, stable IDs and preserves the nine legacy emotes', () => {
  assert.equal(new Set(ALL_EMOTES.map(e => e.id)).size, ALL_EMOTES.length)
  assert.equal(new Set(ALL_EMOTES.map(e => e.riotId)).size, ALL_EMOTES.length)
  for (const e of EMOTES) assert(ALL_EMOTES.some(x => x.id === e.id && x.icon === e.icon))
  assert(ALL_EMOTES.every(e => !e.icon.includes('..') && e.riotId > 0))
})

test('unlock costs once, equips the requested slot and swaps an existing assignment', () => {
  const p = newProfile(), id = extra[0].id
  assert.throws(() => equipEmote(p, id, 0))
  unlockEmote(p, id); unlockEmote(p, id)
  assert.equal(p.essence, 200)
  equipEmote(p, id, 0); equipEmote(p, id, 5)
  assert.equal(p.wheel[5], id)
  assert.equal(new Set(p.wheel).size, 9)
  assert.equal(p.wheel[0], EMOTES[5].id)
  assert.throws(() => equipEmote(p, id, 9))
  p.essence = 0; assert.throws(() => unlockEmote(p, extra[1].id))
})

test('free mode cannot permanently grant unowned emotes and quest mode repairs the wheel', () => {
  const p = newProfile(); p.mode = 'free'
  equipEmote(p, extra[0].id, 0)
  assert(!p.owned.includes(extra[0].id))
  p.mode = 'quest'
  assert.equal(usableWheel(p)[0], EMOTES[0].id)
  const repaired = normalizeProfile({ ...p, wheel: ['missing', EMOTES[0].id, EMOTES[0].id] })
  assert.equal(repaired.wheel.length, 9)
  assert.equal(new Set(repaired.wheel).size, 9)
})

test('chest candidates survive reopening and give only one permanent without duplicate spending', () => {
  const p = newProfile(), choices = [...openChest(p, () => .5)]
  assert.equal(choices.length, 3); assert.equal(new Set(choices).size, 3)
  assert(choices.every(id => !p.owned.includes(id))); assert.equal(p.chests, 0)
  const restored = normalizeProfile(JSON.parse(JSON.stringify(p)))
  assert.deepEqual(openChest(restored, () => .1), choices)
  claimChest(restored, choices[1]); assert(restored.owned.includes(choices[1]))
  assert.equal(restored.pending.length, 0)
  assert.throws(() => claimChest(restored, choices[1]))
  assert.throws(() => openChest(restored))
})

test('last collection item and completed collection do not lose chests', () => {
  const p = newProfile(); p.owned = ALL_EMOTES.slice(0, -1).map(e => e.id)
  assert.equal(openChest(p).length, 1)
  claimChest(p, p.pending[0]); p.chests = 1
  assert.throws(() => openChest(p)); assert.equal(p.chests, 1)
})

test('reading rejects idle, background, sleep and timer gaps', () => {
  const clock = createReadingClock(); clock.activity(0)
  assert.equal(clock.tick(0, true), 0)
  assert.equal(clock.tick(5000, true), 5000)
  assert.equal(clock.tick(10000, false), 0)
  assert.equal(clock.tick(15000, true), 0)
  assert.equal(clock.tick(20000, true), 5000)
  assert.equal(clock.tick(121000, true), 0)
  clock.activity(122000)
  assert.equal(clock.tick(122000, true), 0)
  assert.equal(clock.tick(127000, true), 5000)
  assert.equal(clock.tick(200000, true), 0)
  clock.reset(); assert.equal(clock.tick(201000, true), 0)
})

test('daily reward is idempotent, midnight creates new progress and missed days incur no penalty', () => {
  const p = newProfile()
  for (let i = 0; i < 120; i++) recordReading(p, 5000, time + i * 5000)
  const key = dayKey(new Date(time))
  assert.equal(p.days[key].ms, 600000); assert.equal(p.essence, 350); assert.equal(p.xp, 50)
  assert.equal(p.activeDays.length, 1)
  grantCompleted(p, key); assert.equal(p.essence, 350)
  recordReading(p, 5000, time + 2 * 86400000)
  assert.equal(p.activeDays.length, 1); assert.equal(p.xp, 50)
  assert.equal(Object.keys(p.days).length, 2)
  const ms = p.totalMs
  recordReading(p, 90000, time + 2 * 86400000 + 90000)
  assert.equal(p.totalMs, ms)
  recordReading(p, 5000, time); assert.equal(p.totalMs, ms)
})

test('overlapping reading ticks are not double counted', () => {
  const p = newProfile()
  recordReading(p, 5000, time); recordReading(p, 5000, time)
  assert.equal(p.totalMs, 5000)
  recordReading(p, 5000, time + 1000); assert.equal(p.totalMs, 6000)
})

test('saved notes and distinct pages award rewards only once; edits and duplicated text do not farm notes', () => {
  const p = newProfile(), key = dayKey(new Date(time))
  const marks = [0, 1, 2].map(i => ({ id: `note-${i}`, page: i, noteHash: String(i).repeat(64) }))
  assert.equal(recordSavedMarks(p, doc, marks, key).length, 2)
  assert.equal(p.noteHashes.length, 3); assert.equal(p.days[key].pages.length, 3)
  assert.equal(p.xp, 150); assert.equal(p.essence, 450)
  recordSavedMarks(p, doc, marks, key)
  recordSavedMarks(p, doc, [{ ...marks[0], id: 'copied-note' }, { ...marks[1], noteHash: 'd'.repeat(64) }], key)
  assert.equal(p.noteHashes.length, 3); assert.equal(p.essence, 450)
  assert.equal(qualifyingNote('    很短'), false)
  assert.equal(qualifyingNote('啊'.repeat(100)), false)
  assert.equal(qualifyingNote('这篇文献的实验设置需要进一步核实'), true)
  recordReading(p, 5000, time)
})

test('level crossing awards a bonus chest and milestones are permanent', () => {
  const p = newProfile(), key = dayKey(new Date(time))
  p.xp = 190; p.totalMs = 3600000
  const rewards = grantCompleted(p, key)
  assert.deepEqual(rewards, ['初探峡谷'])
  assert.equal(p.xp, 340); assert.equal(p.chests, 3)
  grantCompleted(p, key); assert.equal(p.chests, 3)
})

test('serialized store updates do not overwrite purchases and persist wheel across reload', async () => {
  const storage = memoryStorage()
  const store = createProfileStore({ storage, locks: null })
  await Promise.all(extra.slice(0, 3).map(e => store.mutate(p => unlockEmote(p, e.id))))
  assert.equal(store.get().essence, 0)
  await store.mutate(p => equipEmote(p, extra[1].id, 8))
  const reload = createProfileStore({ storage, locks: null })
  assert.equal(reload.get().wheel[8], extra[1].id)
  await assert.rejects(store.mutate(p => unlockEmote(p, extra[3].id)))
  assert.equal(reload.export(), store.export())
})

test('corrupt storage is preserved, failed writes do not grant items, and valid backup restores', async () => {
  const storage = memoryStorage(); storage.setItem(PROFILE_KEY, '{broken')
  const store = createProfileStore({ storage, locks: null, onError() {} })
  await assert.rejects(store.mutate(p => unlockEmote(p, extra[0].id)))
  assert.equal(store.export(), '{broken')
  await store.restore(newProfile()); assert.equal(store.get().essence, 300)
  await assert.rejects(store.restore({ version: 99 }))
  const bad = createProfileStore({ storage: { getItem: () => null, setItem: () => { throw new Error('quota') } }, locks: null })
  await assert.rejects(bad.mutate(p => unlockEmote(p, extra[0].id)))
  assert.equal(bad.get().essence, 300); assert(!bad.get().owned.includes(extra[0].id))
})
