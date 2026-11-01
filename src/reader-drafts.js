// Keep only unsaved annotation changes and in-progress text. PDF bytes are never cached here.
let database
let pending = Promise.resolve()

function openDatabase() {
  if (!database) database = new Promise((resolve, reject) => {
    const request = indexedDB.open('pdf-ping-wheel-reading', 1)
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore('drafts', { keyPath: ['documentId', 'item'] })
      store.createIndex('document', 'documentId')
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => { database = null; reject(request.error) }
  })
  return database
}

function enqueue(operation) {
  const run = pending.then(async () => {
    const db = await openDatabase()
    await new Promise((resolve, reject) => {
      const tx = db.transaction('drafts', 'readwrite')
      tx.oncomplete = resolve
      tx.onabort = () => reject(tx.error || new Error('本地草稿写入中断'))
      operation(tx.objectStore('drafts'))
    })
  })
  pending = run.catch(() => {})
  return run
}

export function putDraft(record) {
  return enqueue(store => store.put(record))
}

// A save may finish after another edit or after a different tab has written a newer draft.
export function removeDraft(documentId, item, token) {
  return enqueue(store => {
    const key = [documentId, item]
    const request = store.get(key)
    request.onsuccess = () => { if (request.result?.token === token) store.delete(key) }
  })
}

export async function readDrafts(documentId) {
  await pending
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const request = db.transaction('drafts').objectStore('drafts').index('document').getAll(documentId)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export function flushDrafts() { return pending }

export function stampSignature(stamp) {
  if (!stamp) return null
  return JSON.stringify([stamp.type, stamp.page, stamp.x, stamp.y, stamp.width, stamp.height,
    stamp.text || '', stamp.questionNote || '', stamp.answer || '', Boolean(stamp.resolved)])
}

export class DocumentDrafts {
  constructor(documentId, marks, onChange) {
    this.documentId = documentId
    this.base = new Map(marks.map(mark => [mark.id, stampSignature(mark)]))
    this.tokens = new Map()
    this.composers = new Map()
    this.onChange = onChange
    this.writeFailed = false
  }

  async restore(marks, pageCount) {
    const results = new Map(marks.map(mark => [mark.id, mark]))
    const authored = new Set(), reviews = new Set()
    let skipped = 0
    const records = await readDrafts(this.documentId)
    for (const record of records) {
      if (record.item.startsWith('chat:')) {
        this.composers.set(record.item, record.value)
      } else {
        const id = record.item.slice(5)
        // Another PDF editor may have changed a mark or removed a page since the draft was written.
        if (record.base !== (this.base.get(id) ?? null) || (record.value && record.value.page >= pageCount)) {
          skipped++
          continue
        }
        if (record.value) results.set(id, record.value)
        else results.delete(id)
        if (record.authored) authored.add(id)
        if (record.reviewed) reviews.add(id)
      }
      this.tokens.set(record.item, record.token)
    }
    return { marks: [...results.values()], authored, reviews, skipped }
  }

  write(item, fields) {
    const token = crypto.randomUUID()
    this.tokens.set(item, token)
    putDraft({ ...fields, documentId: this.documentId, item, token }).catch(() => this.fail())
    this.onChange()
  }

  drop(item) {
    const token = this.tokens.get(item)
    if (!token) return
    this.tokens.delete(item)
    removeDraft(this.documentId, item, token).catch(() => this.fail())
    this.onChange()
  }

  fail() { this.writeFailed = true; this.onChange() }

  mark(id, value, authored, reviewed) {
    const base = this.base.get(id) ?? null
    if (stampSignature(value) === base) this.drop(`mark:${id}`)
    else this.write(`mark:${id}`, { value: value ? { ...value } : null, base, authored, reviewed })
  }

  composer(id, value) {
    const item = `chat:${id || 'new'}`
    if (!value) { this.composers.delete(item); this.drop(item); return }
    this.composers.set(item, value)
    this.write(item, { value })
  }

  rebase(snapshot, current, authored, reviews, capturedItems) {
    this.base = new Map(snapshot.map(mark => [mark.id, stampSignature(mark)]))
    const currentById = new Map(current.map(mark => [mark.id, mark]))
    for (const item of new Set([...capturedItems, ...this.tokens.keys()])) {
      if (!item.startsWith('mark:')) continue
      const id = item.slice(5)
      this.mark(id, currentById.get(id), authored.has(id), reviews.has(id))
    }
  }
}
