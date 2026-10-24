import { strict as assert } from 'node:assert'
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, StandardFonts, decodePDFRawStream, rgb } from 'pdf-lib'
import {
  buildSavedPdf,
  describeBakedPings,
  describePingAnnotations,
  readPingPayload,
  stripPluginArtifacts,
} from '../src/pdf-io.js'
import { encodePng } from './png.mjs'
import { PINGS, STAMP_TYPES, NOTE } from '../src/pings.js'

function pageText(pdfDoc) {
  let out = ''
  for (const page of pdfDoc.getPages()) {
    const contents = page.node.normalizedEntries().Contents
    if (!(contents instanceof PDFArray)) continue
    for (let i = 0; i < contents.size(); i++) {
      const stream = pdfDoc.context.lookup(contents.get(i))
      if (!stream) continue
      if (stream.operators && typeof stream.getContentsString === 'function') {
        out += stream.getContentsString()
      } else if (stream.dict && stream.contents) {
        out += Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1')
      }
    }
  }
  return out
}

const png = encodePng(16, () => [47, 111, 237, 255])
const pngByType = Object.fromEntries(STAMP_TYPES.map((stamp) => [stamp.id, png]))
const source = await PDFDocument.create()
const page = source.addPage([612, 792])
const font = await source.embedFont(StandardFonts.Helvetica)
page.drawText('HELLO', { x: 72, y: 720, size: 24, font, color: rgb(0, 0, 0) })
const originalNote = source.context.obj({ Type: 'Annot', Subtype: 'Text', Rect: [20, 20, 40, 40], F: 4 })
originalNote.set(PDFName.of('Contents'), PDFHexString.fromText('Keep this existing PDF note'))
page.node.addAnnot(source.context.register(originalNote))
const clean = await source.save()

const ping = { id: 'ping-1', page: 0, x: 180.25, y: 400.5, type: 'caution' }
const saved = await buildSavedPdf(clean, [ping], pngByType)
// PDF objects may be compressed into object streams, so raw-byte substring checks are brittle.
// The parsed payload and annotation assertions below verify the actual metadata.

const baked = await PDFDocument.load(saved)
const payload = readPingPayload(baked)
assert(payload.found && !payload.error, 'editable payload missing')
assert.equal(payload.version, 2)
assert.equal(payload.source, 'annotations')
assert.equal(payload.pings.length, 1)
assert.equal(payload.pings[0].type, 'caution')
assert.equal(payload.pings[0].x, 180.25)
assert.equal(payload.pings[0].y, 400.5)
assert.equal(describePingAnnotations(baked).length, 1, 'native Stamp annotation missing')
assert.equal(describeBakedPings(baked).length, 0, 'v2 must not use page-content image streams')

const annots = baked.getPages()[0].node.normalizedEntries().Annots
assert(annots instanceof PDFArray && annots.size() === 2, 'existing PDF annotation was not preserved')
let annotation = null
for (let i = 0; i < annots.size(); i++) {
  const candidate = baked.context.lookup(annots.get(i))
  if (candidate instanceof PDFDict && candidate.lookupMaybe(PDFName.of('PDFPingWheel'), PDFDict)) annotation = candidate
}
assert(annotation, 'native plugin annotation dictionary missing')
assert(annotation instanceof PDFDict, 'annotation dictionary missing')
assert.equal(annotation.lookup(PDFName.of('Subtype'), PDFName).toString(), '/Stamp', 'annotation subtype is not Stamp')
assert.equal(annotation.lookup(PDFName.of('F')).asNumber(), 4, 'Stamp should be printable')
const ap = annotation.lookup(PDFName.of('AP'), PDFDict)
const appearance = baked.context.lookup(ap.lookup(PDFName.of('N')))
assert(appearance?.getContentsString?.().includes('/Im0 Do'), 'annotation appearance does not draw the PNG')
const resources = appearance.dict.lookup(PDFName.of('Resources'), PDFDict)
const xObjects = resources.lookup(PDFName.of('XObject'), PDFDict)
assert(xObjects.has(PDFName.of('Im0')), 'appearance image resource missing')
assert(annotation.lookup(PDFName.of('PDFPingWheel'), PDFDict), 'per-annotation metadata missing')

// The rectangle is the source of truth, so moving a Stamp in another PDF editor
// should be reflected when the extension reopens the document.
annotation.set(PDFName.of('Rect'), baked.context.obj([100, 200, 136, 236]))
const moved = readPingPayload(baked)
assert.equal(moved.pings[0].x, 118)
assert.equal(moved.pings[0].y, 218)

stripPluginArtifacts(baked)
assert.equal(describePingAnnotations(baked).length, 0, 'native Stamp was not removed from working copy')
assert.equal(describeBakedPings(baked).length, 0, 'legacy stream unexpectedly present')
assert.equal(baked.getPages()[0].node.normalizedEntries().Annots.size(), 1, 'cleanup removed a pre-existing user annotation')
const infoRef = baked.context.trailerInfo.Info
const info = infoRef ? baked.context.lookup(infoRef) : null
assert(!info?.has(PDFName.of('PDFPingWheel')), 'stale app index was not removed from working copy')
const stripped = await baked.save({ updateMetadata: false })
const again = await PDFDocument.load(stripped)
assert.equal(readPingPayload(again).found, false, 'clean working PDF should not retain ping metadata')
assert(pageText(again).includes('HELLO') || pageText(again).includes('48454C4C4F'), 'stripping removed original page text')

// Every signal type must round-trip as a native annotation.
for (const type of STAMP_TYPES.map((p) => p.id)) {
  const next = await buildSavedPdf(clean, [{ ...ping, id: `id-${type}`, type }], pngByType)
  const doc2 = await PDFDocument.load(next)
  const payload2 = readPingPayload(doc2)
  assert.equal(payload2.pings.length, 1, `annotation count failure: ${type}`)
  assert.equal(payload2.pings[0].type, type, `annotation type failure: ${type}`)
  assert.equal(describePingAnnotations(doc2).length, 1, `Stamp subtype failure: ${type}`)
}

// Text notes are native Stamp annotations with their content persisted in annotation metadata.
const noteText = '检查这里的计算步骤\n第二行备注：确认单位'
const note = { id: 'note-roundtrip', page: 0, x: 210, y: 330, type: NOTE.id, text: noteText, width: 230, height: 60 }
const noteSaved = await buildSavedPdf(clean, [note], { [note.id]: png })
const noteDoc = await PDFDocument.load(noteSaved)
const notePayload = readPingPayload(noteDoc)
assert.equal(notePayload.pings.length, 1)
assert.equal(notePayload.pings[0].type, NOTE.id)
assert.equal(notePayload.pings[0].text, noteText, 'note text was not persisted')
assert.equal(notePayload.pings[0].width, 230)
assert.equal(notePayload.pings[0].height, 60)
const noteAnnotation = noteDoc.context.lookup(noteDoc.getPages()[0].node.normalizedEntries().Annots.get(1))
assert.equal(noteAnnotation.lookup(PDFName.of('Contents'), PDFHexString).decodeText(), noteText)

// Emote PNG bytes are indexed once in the PDF metadata so a second machine can restore the overlay.
const emoteData = Buffer.from(png).toString('base64')
const emoteSaved = await buildSavedPdf(clean, [{ ...ping, id: 'emote-test', type: 'emote_thumb', assetData: emoteData }], pngByType)
const emoteDoc = await PDFDocument.load(emoteSaved)
const emotePayload = readPingPayload(emoteDoc)
assert.equal(emotePayload.pings[0].type, 'emote_thumb')
assert.equal(emotePayload.pings[0].assetData, emoteData, 'emote asset was not portable in metadata')

const empty = await buildSavedPdf(clean, [], pngByType)
const emptyDoc = await PDFDocument.load(empty)
const emptyPayload = readPingPayload(emptyDoc)
assert(emptyPayload.found && emptyPayload.pings.length === 0, 'empty save should still record v2 format')
assert.equal(describePingAnnotations(emptyDoc).length, 0, 'empty save created a Stamp annotation')

// Legacy v1 documents used an Info payload plus tagged image-only page streams.
const legacyDoc = await PDFDocument.create()
const legacyPage = legacyDoc.addPage([612, 792])
const legacyFont = await legacyDoc.embedFont(StandardFonts.Helvetica)
legacyPage.drawText('LEGACY TEXT', { x: 72, y: 720, size: 18, font: legacyFont })
const legacyImage = await legacyDoc.embedPng(png)
// Model the v1 format faithfully: the plugin image lived in its own tagged
// content stream, separate from the user's original page text.
const legacyImageStream = legacyDoc.context.stream(
  new TextEncoder().encode('q\\n36 0 0 36 150 380 cm\\n/Im0 Do\\nQ\\n'),
  {
    Resources: { XObject: { Im0: legacyImage.ref } },
    PDFPingWheel: PDFName.of('Baked'),
  },
)
legacyPage.node.addContentStream(legacyDoc.context.register(legacyImageStream))
const legacyInfo = legacyDoc.context.obj({})
legacyDoc.context.trailerInfo.Info = legacyDoc.context.register(legacyInfo)
legacyInfo.set(PDFName.of('PDFPingWheel'), PDFHexString.fromText(JSON.stringify({
  v: 1,
  pings: [{ id: 'legacy-ping', page: 0, x: 168, y: 398, type: 'question' }],
})))
const legacySaved = await legacyDoc.save()
const legacyReopened = await PDFDocument.load(legacySaved)
const legacyPayload = readPingPayload(legacyReopened)
assert.equal(legacyPayload.version, 1, 'legacy version not detected')
assert.equal(legacyPayload.source, 'legacy-info')
assert.equal(legacyPayload.pings[0].id, 'legacy-ping')
assert.equal(describeBakedPings(legacyReopened).length, 1, 'legacy image stream not detected')
stripPluginArtifacts(legacyReopened)
assert.equal(describeBakedPings(legacyReopened).length, 0, 'legacy image stream not stripped')
assert(pageText(legacyReopened).includes('LEGACY TEXT') || pageText(legacyReopened).includes('4C45474143592054455854'), 'legacy cleanup removed original text')

console.log('PASS: native Stamp appearance, editable metadata, moved-Rect recovery, cleanup, 19 stamp types, portable emote image data, persistent text notes, empty save, and v1 compatibility')
