import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  decodePDFRawStream,
} from 'pdf-lib'
import { PINGS, STAMP_TYPES, NOTE, NOTE_MAX_CHARS, PING_SIZE, stampSize, pingById } from './pings.js'

// PDFPingWheel v2 uses native Stamp annotations. Version 1 files used tagged page-content streams and an Info-dictionary JSON payload;
// Info index v3 stores portable emote PNG data; v4 also persists note text, while native annotations remain authoritative.
const META_KEY = PDFName.of('PDFPingWheel')
const APP_PREFIX = 'PDFPingWheel:'
const TYPES = new Set([...STAMP_TYPES.map((stamp) => stamp.id), NOTE.id])
const V_KEY = PDFName.of('v')
const ID_KEY = PDFName.of('id')
const TYPE_KEY = PDFName.of('type')
const X_KEY = PDFName.of('x')
const Y_KEY = PDFName.of('y')
const DOCUMENT_KEY = PDFName.of('PDFPingWheelDocument')

export function readDocumentId(pdfDoc) {
  const value = existingInfoDict(pdfDoc)?.lookup(DOCUMENT_KEY)
  const id = value?.decodeText?.() || ''
  return /^[a-f0-9]{64}$/.test(id) ? id : ''
}

function round2(n) {
  return Math.round(n * 100) / 100
}

function existingInfoDict(pdfDoc) {
  const ref = pdfDoc.context.trailerInfo.Info
  if (!ref) return null
  const info = pdfDoc.context.lookup(ref)
  return info instanceof PDFDict ? info : null
}

function infoDict(pdfDoc) {
  const existing = existingInfoDict(pdfDoc)
  if (existing) return existing
  const created = pdfDoc.context.obj({})
  pdfDoc.context.trailerInfo.Info = pdfDoc.context.register(created)
  return created
}

function latin1(bytes) {
  let out = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    out += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return out
}

function streamText(stream) {
  if (stream?.operators && typeof stream.getContentsString === 'function') {
    return stream.getContentsString()
  }
  const decoded = decodePDFRawStream(stream).decode()
  return latin1(decoded)
}

function sanitizePings(list) {
  const seen = new Set()
  const pings = []
  for (const raw of list) {
    if (!raw || !TYPES.has(raw.type)) continue
    if (!Number.isInteger(raw.page) || raw.page < 0) continue
    if (!Number.isFinite(raw.x) || !Number.isFinite(raw.y)) continue
    let id = typeof raw.id === 'string' ? raw.id : ''
    if (!id || seen.has(id)) id = crypto.randomUUID()
    seen.add(id)
    const ping = {
      id,
      page: raw.page,
      x: round2(raw.x),
      y: round2(raw.y),
      type: raw.type,
    }
    if (Number.isFinite(raw.width) && raw.width >= 10 && raw.width <= 500) ping.width = round2(raw.width)
    if (Number.isFinite(raw.height) && raw.height >= 10 && raw.height <= 500) ping.height = round2(raw.height)
    if (typeof raw.assetData === 'string' && raw.assetData.length <= 3_000_000 && /^[A-Za-z0-9+/]+={0,2}$/.test(raw.assetData)) ping.assetData = raw.assetData
    if (raw.type === NOTE.id) {
      const text = typeof raw.text === 'string' ? raw.text.replace(/\r\n?/g, '\n').slice(0, NOTE_MAX_CHARS) : ''
      if (!text.trim()) continue
      ping.text = text
    }
    pings.push(ping)
  }
  return pings
}

function readInfoPayload(pdfDoc) {
  const info = existingInfoDict(pdfDoc)
  if (!info?.has(META_KEY)) return { found: false, pings: [], version: 0, assets: {} }
  try {
    const value = info.lookup(META_KEY)
    if (!value || typeof value.decodeText !== 'function') {
      return { found: true, error: true, pings: [], version: 0, assets: {} }
    }
    const data = JSON.parse(value.decodeText())
    if (!data || ![1, 2, 3, 4].includes(data.v) || !Array.isArray(data.pings)) {
      return { found: true, error: true, pings: [], version: 0, assets: {} }
    }
    return {
      found: true,
      error: false,
      version: data.v,
      pings: sanitizePings(data.pings),
      assets: data.assets && typeof data.assets === 'object' && !Array.isArray(data.assets) ? data.assets : {},
    }
  } catch {
    return { found: true, error: true, pings: [], version: 0, assets: {} }
  }
}

function readText(dict, key) {
  const value = dict?.lookup(PDFName.of(key))
  if (value && typeof value.decodeText === 'function') return value.decodeText()
  return ''
}

function readNumber(dict, key) {
  const value = dict?.lookupMaybe(PDFName.of(key), PDFNumber)
  return value?.asNumber()
}

function markerMetadata(annotation) {
  if (!(annotation instanceof PDFDict)) return null
  const data = annotation.lookupMaybe(META_KEY, PDFDict)
  if (!data || readNumber(data, 'v') !== 2) return null
  return data
}

function annotationPing(annotation, pageIndex) {
  const data = markerMetadata(annotation)
  if (!data) return null

  const type = readText(data, 'type')
  if (!TYPES.has(type)) return null
  let id = readText(data, 'id')
  if (!id) {
    id = readText(annotation, 'NM').replace(new RegExp(`^${APP_PREFIX}`), '')
  }

  // The standard annotation rectangle is authoritative. This lets edits made
  // in Acrobat or another PDF editor survive a round trip through this app.
  let x = readNumber(data, 'x')
  let y = readNumber(data, 'y')
  const rect = annotation.lookupMaybe(PDFName.of('Rect'), PDFArray)
  if (rect?.size() === 4) {
    const values = [0, 1, 2, 3].map((i) => rect.lookup(i, PDFNumber)?.asNumber())
    if (values.every(Number.isFinite)) {
      x = (values[0] + values[2]) / 2
      y = (values[1] + values[3]) / 2
    }
  }
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  let width = stampSize(type)
  let height = width
  if (rect?.size() === 4) {
    const values = [0, 1, 2, 3].map((i) => rect.lookup(i, PDFNumber)?.asNumber())
    if (values.every(Number.isFinite)) {
      const rw = Math.abs(values[2] - values[0])
      const rh = Math.abs(values[3] - values[1])
      if (rw >= 10 && rw <= 500) width = rw
      if (rh >= 10 && rh <= 500) height = rh
    }
  }
  const result = { id, page: pageIndex, x, y, type, width, height }
  if (type === NOTE.id) {
    const text = readText(data, 'text') || readText(annotation, 'Contents')
    if (!text.trim()) return null
    result.text = text.slice(0, NOTE_MAX_CHARS)
  }
  return result
}

/** Read all PDFPingWheel v2 Stamp annotations, independent of Info metadata. */
export function readPingAnnotations(pdfDoc) {
  const pings = []
  const pages = pdfDoc.getPages()
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    const annots = pages[pageIndex].node.normalizedEntries().Annots
    if (!(annots instanceof PDFArray)) continue
    for (let i = 0; i < annots.size(); i++) {
      const annotation = pdfDoc.context.lookup(annots.get(i))
      const ping = annotationPing(annotation, pageIndex)
      if (ping) pings.push(ping)
    }
  }
  return sanitizePings(pings)
}

/**
 * Read editable marks. Native v2 Stamp annotations are the source of truth. Version 1
 * files fall back to their Info payload and tagged page-content streams; index v3 carries emote assets.
 */
export function readPingPayload(pdfDoc) {
  const annotations = readPingAnnotations(pdfDoc)
  if (annotations.length) {
    const info = readInfoPayload(pdfDoc)
    const assets = info.assets || {}
    const pings = annotations.map((ping) => ({
      ...ping,
      ...(typeof assets[ping.type] === 'string' && assets[ping.type].length <= 3_000_000
        ? { assetData: assets[ping.type] } : {}),
    }))
    return { found: true, error: false, version: 2, source: 'annotations', pings }
  }

  const info = readInfoPayload(pdfDoc)
  if (!info.found || info.error) return info
  if (info.version === 1) return { ...info, source: 'legacy-info' }

  // In v2, annotations are authoritative. If an external editor removed all
  // stamps, don't resurrect them from a stale summary list in the Info dictionary.
  const staleIndex = info.pings.length > 0
  return {
    found: true,
    error: false,
    version: 2,
    source: 'annotation-index',
    pings: [],
    warning: staleIndex ? '未找到原生标记注释，可能已被其他 PDF 软件删除；为避免恢复已删除标记，未自动还原。' : '',
  }
}

export function writePingPayload(pdfDoc, pings) {
  const assets = {}
  for (const ping of pings) {
    if (typeof ping.assetData === 'string' && ping.assetData.length <= 3_000_000 && !assets[ping.type]) {
      assets[ping.type] = ping.assetData
    }
  }
  const payload = {
    v: 4,
    app: 'pdf-ping-wheel',
    assets,
    pings: pings.map((ping) => ({
      id: ping.id,
      page: ping.page,
      x: round2(ping.x),
      y: round2(ping.y),
      type: ping.type,
      ...(ping.width ? { width: round2(ping.width) } : {}),
      ...(ping.height ? { height: round2(ping.height) } : {}),
      ...(ping.type === NOTE.id ? { text: ping.text } : {}),
    })),
  }
  infoDict(pdfDoc).set(META_KEY, PDFHexString.fromText(JSON.stringify(payload)))
  const creator = pdfDoc.getCreator?.() || ''
  if (!creator || creator.startsWith('pdf-lib')) {
    pdfDoc.setCreator('PDF Ping Wheel')
  }
}

function isPluginAnnotation(annotation) {
  return markerMetadata(annotation) !== null
}

function stripNativePingAnnotations(pdfDoc) {
  for (const page of pdfDoc.getPages()) {
    const annots = page.node.normalizedEntries().Annots
    if (!(annots instanceof PDFArray)) continue
    for (let i = annots.size() - 1; i >= 0; i--) {
      const annotation = pdfDoc.context.lookup(annots.get(i))
      if (isPluginAnnotation(annotation)) annots.remove(i)
    }
  }
}

/** Remove legacy v1 image-only content streams without touching unrelated resources. */
function stripLegacyBakedPings(pdfDoc) {
  for (const page of pdfDoc.getPages()) {
    const contents = page.node.normalizedEntries().Contents
    if (!(contents instanceof PDFArray)) continue
    for (let i = contents.size() - 1; i >= 0; i--) {
      const stream = pdfDoc.context.lookup(contents.get(i))
      if (stream?.dict?.has?.(META_KEY)) contents.remove(i)
    }
  }
}

/**
 * Remove app-owned annotations, legacy baked-image streams and their Info index
 * from the in-memory working copy. Ordinary PDF annotations are preserved.
 */
export function stripPluginArtifacts(pdfDoc) {
  stripNativePingAnnotations(pdfDoc)
  stripLegacyBakedPings(pdfDoc)
  const info = existingInfoDict(pdfDoc)
  if (info?.has(META_KEY)) info.delete(META_KEY)
}

// Backwards-compatible name used by v1.2 viewer code and downstream scripts.
export const stripBakedPings = stripPluginArtifacts

/** Legacy diagnostic helper: decoded contents of old v1 image-only streams. */
export function describeBakedPings(pdfDoc) {
  const texts = []
  for (const page of pdfDoc.getPages()) {
    const contents = page.node.normalizedEntries().Contents
    if (!(contents instanceof PDFArray)) continue
    for (let i = 0; i < contents.size(); i++) {
      const stream = pdfDoc.context.lookup(contents.get(i))
      if (!stream?.dict?.has?.(META_KEY)) continue
      texts.push(streamText(stream))
    }
  }
  return texts
}

/** Diagnostic helper used by the round-trip tests. */
export function describePingAnnotations(pdfDoc) {
  return readPingAnnotations(pdfDoc)
}

function addStampAnnotation(pdfDoc, page, ping, image) {
  const context = pdfDoc.context
  const size = ping.width || stampSize(ping.type) || PING_SIZE
  const height = ping.height || stampSize(ping.type) || PING_SIZE
  const halfW = size / 2
  const halfH = height / 2
  const appearanceBytes = new TextEncoder().encode(
    `q\n${size} 0 0 ${height} 0 0 cm\n/Im0 Do\nQ\n`,
  )
  const appearance = context.stream(appearanceBytes, {
    Type: 'XObject',
    Subtype: 'Form',
    FormType: 1,
    BBox: [0, 0, size, height],
    Matrix: [1, 0, 0, 1, 0, 0],
    Resources: { XObject: { Im0: image.ref } },
  })
  const appearanceRef = context.register(appearance)
  const metadata = context.obj({
    v: 2,
    page: ping.page,
    x: round2(ping.x),
    y: round2(ping.y),
  })
  metadata.set(ID_KEY, PDFHexString.fromText(ping.id))
  metadata.set(TYPE_KEY, PDFHexString.fromText(ping.type))
  if (ping.type === NOTE.id) metadata.set(PDFName.of('text'), PDFHexString.fromText(ping.text))

  const annotation = context.obj({
    Type: 'Annot',
    Subtype: 'Stamp',
    Rect: [ping.x - halfW, ping.y - halfH, ping.x + halfW, ping.y + halfH],
    P: page.ref,
    F: 4, // Print; not hidden, not locked.
    AP: { N: appearanceRef },
  })
  annotation.set(PDFName.of('NM'), PDFHexString.fromText(`${APP_PREFIX}${ping.id}`))
  const spec = pingById(ping.type)
  annotation.set(PDFName.of('Contents'), PDFHexString.fromText(ping.type === NOTE.id ? ping.text : `PDF Ping Wheel — ${spec?.label || ping.type}`))
  annotation.set(META_KEY, metadata)
  page.node.addAnnot(context.register(annotation))
}

export async function buildSavedPdf(cleanBytes, pings, pngByType, { documentId = '' } = {}) {
  const pdfDoc = await PDFDocument.load(cleanBytes.slice(), { updateMetadata: false })
  stripPluginArtifacts(pdfDoc)
  const pages = pdfDoc.getPages()
  const safePings = sanitizePings(pings).filter((ping) => ping.page < pages.length)

  const embedded = new Map()
  const usedTypes = new Set(safePings.filter((ping) => ping.type !== NOTE.id).map((ping) => ping.type))
  for (const stamp of STAMP_TYPES) {
    if (!usedTypes.has(stamp.id)) continue
    const bytes = pngByType[stamp.id]
    if (!bytes) throw new Error(`缺少 ${stamp.label} 的图片`)
    embedded.set(stamp.id, await pdfDoc.embedPng(bytes))
  }
  // Each text note has its own generated image, keyed by annotation ID.
  for (const ping of safePings) {
    if (ping.type !== NOTE.id) continue
    const bytes = pngByType[ping.id]
    if (!bytes) throw new Error('缺少备注图片')
    embedded.set(ping.id, await pdfDoc.embedPng(bytes))
  }

  for (const ping of safePings) {
    const page = pages[ping.page]
    const image = embedded.get(ping.type === NOTE.id ? ping.id : ping.type)
    if (!page || !image) continue
    addStampAnnotation(pdfDoc, page, ping, image)
  }

  writePingPayload(pdfDoc, safePings)
  if (/^[a-f0-9]{64}$/.test(documentId)) infoDict(pdfDoc).set(DOCUMENT_KEY, PDFHexString.fromText(documentId))
  return pdfDoc.save()
}
