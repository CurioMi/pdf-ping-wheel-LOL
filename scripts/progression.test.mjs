import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ALL_EMOTES, EMOTES } from '../src/pings.js'
import { readingTrail, LAMP_MS } from '../src/reading-trail.js'
import { COMPANIONS, companionState } from '../src/companions.js'
import { companionGlyph, readerTasks } from '../src/companion-ui.js'
import {
  newProfile, normalizeProfile, usableWheel, equipEmote, unlockEmote, openChest, claimChest,
  recordReading, recordSavedMarks, recordQuestionReviews, qualifyingNote, grantCompleted, createReadingClock,
  createProfileStore, PROFILE_KEY, dayKey,
} from '../src/progression.js'

const extra = ALL_EMOTES.filter(e => !EMOTES.some(s => s.id === e.id))
const doc = 'a'.repeat(64)

test('new readers get an egg, older readers keep their lantern, and backups retain the selected companion', async () => {
  const p = newProfile()
  assert.equal(companionState(p).form, '龙蛋')
  delete p.companion
  p.totalMs = 37 * 60000
  assert.equal(companionState(normalizeProfile(p)), null)
  assert.equal(normalizeProfile({ ...p, companion: '__proto__' }).companion, 'lantern')
  const storage = memoryStorage(), store = createProfileStore({ storage, locks: null })
  await store.restore(p)
  await store.mutate(next => { next.companion = 'smolder' })
  const reopened = createProfileStore({ storage, locks: null })
  assert.equal(companionState(reopened.get()).layers, 7)
  assert.equal(JSON.parse(reopened.export()).companion, 'smolder')
  assert.equal(reopened.get().xp, p.xp)
})

test('every companion changes shape at its own thresholds and keeps stacking after its final form', () => {
  for (const [id, pet] of Object.entries(COMPANIONS)) {
    const faces = new Set()
    for (const [stage, [layers, name]] of pet.forms.entries()) {
      const p = newProfile()
      if (id === 'harvest') p.reviewReceipts = Array.from({ length: layers }, (_, n) => doc + ':' + n)
      else p.totalMs = layers * (id === 'smolder' ? 300000 : 600000)
      const state = companionState(p, id)
      assert.equal(state.stage, stage); assert.equal(state.form, name); assert.equal(state.layers, layers)
      faces.add(companionGlyph(state))
    }
    assert.equal(faces.size, 4)
  }
  const p = newProfile(); p.totalMs = 2000 * 300000
  assert.equal(companionState(p).layers, 2000)
  assert.equal(companionState(p).next, undefined)
})

test('layers use credited time, unique document pages and unique resolved questions across dates', () => {
  const p = newProfile(), today = '2026-11-01', tomorrow = '2026-11-02'
  p.totalMs = 599000
  p.days[today] = { ms: 599000, pages: [], notes: 0, reviews: 0, claimed: [] }
  assert.equal(companionState(p).layers, 1)
  recordReading(p, 1000, new Date(today + 'T12:00:00').getTime())
  assert.equal(companionState(p).layers, 2)
  const mark = { id: 'mark', page: 2 }
  recordSavedMarks(p, doc, [mark, { ...mark, id: 'another' }], today)
  recordSavedMarks(p, doc, [mark], tomorrow)
  recordSavedMarks(p, 'b'.repeat(64), [mark], tomorrow)
  assert.equal(companionState(p, 'sol').layers, 3)
  recordQuestionReviews(p, doc, ['one', 'one'], today)
  recordQuestionReviews(p, doc, ['one'], tomorrow)
  assert.equal(companionState(p, 'harvest').layers, 1)
  assert.deepEqual(readerTasks(p, today).map(t => t.status), ['done', 'started', 'done'])
  assert.deepEqual(readerTasks(p, '2026-11-03').map(t => t.status), ['empty', 'empty', 'empty'])
  assert.equal(companionState(normalizeProfile(JSON.parse(JSON.stringify(p))), 'sol').layers, 3)
})

test('a newly resolved question earns daily XP only once, including after profile reload and across days', () => {
  const profile = newProfile()
  const today = '2026-11-01', tomorrow = '2026-11-02'
  assert.deepEqual(recordQuestionReviews(profile, doc, ['question-1'], today), ['疑问回访'])
  assert.equal(profile.xp, 25)
  const restored = normalizeProfile(JSON.parse(JSON.stringify(profile)))
  assert.deepEqual(recordQuestionReviews(restored, doc, ['question-1'], tomorrow), [])
  assert.deepEqual(recordQuestionReviews(restored, doc, ['question-2', 'question-3'], tomorrow), ['疑问回访'])
  assert.equal(restored.xp, 50)
})
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

test('the first lamp sums short reading sessions on separate days, and survives exporting an old profile', () => {
  const p = newProfile()
  for (let i = 0; i < 72; i++) recordReading(p, 5000, time + i * 5000)
  assert.equal(readingTrail(p.totalMs).progressMs, 360000)
  for (let i = 0; i < 48; i++) recordReading(p, 5000, time + 86400000 + i * 5000)
  const trail = readingTrail(normalizeProfile(JSON.parse(JSON.stringify(p))).totalMs)
  assert.equal(trail.lights, 1); assert.equal(trail.litHere, 1); assert.equal(trail.progressMs, 0)
  assert.equal(trail.nextStop, '松间哨站')
})

test('four lit landmarks keep their finished map; subsequent routes rotate and old chapters can be revisited', () => {
  const elapsed = 4 * LAMP_MS
  assert.equal(readingTrail(elapsed - 1).currentChapter, 0)
  const next = readingTrail(elapsed)
  assert.equal(next.currentChapter, 1); assert.equal(next.litHere, 0); assert.equal(next.route.name, '薄雾山径')
  const first = readingTrail(elapsed, 0)
  assert.equal(first.route.name, '萤溪谷'); assert.equal(first.litHere, 4)
  assert.equal(readingTrail(elapsed, 999).chapter, 1)
  assert.equal(readingTrail(12 * LAMP_MS).route.name, first.route.name)
  assert.equal(readingTrail(NaN).lights, 0)
})

test('quiet reading counts without input for exactly ten foreground minutes, including a partial last tick', () => {
  const clock = createReadingClock(); clock.startQuiet(0)
  let credited = 0
  for (let t = 7000; t <= 602000; t += 7000) credited += clock.tick(t, true)
  assert.equal(credited, 600000); assert.equal(clock.quietRemainingMs, 0)
  assert.equal(clock.tick(609000, true), 0)
  clock.activity(610000); assert.equal(clock.tick(610000, true), 0)
  assert.equal(clock.tick(615000, true), 5000)
})

test('pausing or sleeping preserves the unused quiet budget, and ending it returns to normal idle rules', () => {
  const clock = createReadingClock(); clock.startQuiet(0)
  assert.equal(clock.tick(5000, true), 5000)
  clock.reset(); assert.equal(clock.tick(65000, false), 0)
  assert.equal(clock.tick(70000, true), 0)
  assert.equal(clock.tick(75000, true), 5000)
  assert.equal(clock.tick(375000, true), 0)
  assert.equal(clock.quietRemainingMs, 590000)
  clock.endQuiet(); assert.equal(clock.quietRemainingMs, 0)
  assert.equal(clock.tick(380000, true), 0)
})

test('looking up a reference before the next timer tick credits the actual fragment just once', () => {
  const clock = createReadingClock(); clock.activity(0)
  assert.equal(clock.pause(2400), 2400)
  assert.equal(clock.pause(2600), 0)
  assert.equal(clock.tick(30000, false), 0)
  clock.activity(40000)
  assert.equal(clock.tick(45000, true), 5000)
  clock.startQuiet(45000)
  assert.equal(clock.pause(47250), 2250)
  assert.equal(clock.quietRemainingMs, 597750)
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
