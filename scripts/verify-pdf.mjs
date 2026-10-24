import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { encodePng } from './png.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const bundle = await readFile(join(root, 'dist/assets/viewer.js'), 'utf8')
const before = bundle.slice(0, bundle.indexOf('// src/viewer.js'))
const ctx = vm.createContext({
  console,
  crypto: globalThis.crypto,
  TextEncoder,
  TextDecoder,
  setTimeout,
  clearTimeout,
  Uint8Array,
  Buffer,
  URL,
  atob,
  btoa,
})
vm.runInContext(before.replaceAll('import.meta.url', '"file:///offline-runtime.mjs"'), ctx, { timeout: 15000 })
ctx.TEST_PNG = encodePng(16, () => [47, 111, 237, 255])
const test = `
function countLegacyStreams(doc) {
 let count = 0
 for (const page of doc.getPages()) {
   const contents = page.node.normalizedEntries().Contents
   if (!contents || typeof contents.size !== 'function') continue
   for (let i = 0; i < contents.size(); i++) {
     const stream = doc.context.lookup(contents.get(i))
     if (stream?.dict?.has?.(PDFName_default.of('PDFPingWheel'))) count++
   }
 }
 return count
}
(async () => {
 const doc = await PDFDocument_default.create()
 const page = doc.addPage([612,792])
 page.drawText('HELLO', { x:72, y:700 })
 const note = doc.context.obj({Type:'Annot',Subtype:'Text',Rect:[20,20,40,40],F:4})
 note.set(PDFName_default.of('Contents'),PDFHexString_default.fromText('Keep this existing note'))
 page.node.addAnnot(doc.context.register(note))
 const bytes = await doc.save()
 const ping = { id:'native-ping', page:0, x:125.25, y:240.5, type:'question' }
 const saved = await buildSavedPdf(bytes, [ping], {question:TEST_PNG})
 const reopened = await PDFDocument_default.load(saved)
 const payload = readPingPayload(reopened)
 if (!payload.found || payload.error || payload.version!==2 || payload.source!=='annotations') throw new Error('native payload missing')
 if (payload.pings.length!==1 || payload.pings[0].type!=='question') throw new Error('native ping data mismatch')
 if (Math.abs(payload.pings[0].x-125.25)>0.01 || Math.abs(payload.pings[0].y-240.5)>0.01) throw new Error('native coordinates mismatch')
 if (payload.pings.length!==1) throw new Error('Stamp annotation missing')
 if (countLegacyStreams(reopened)!==0) throw new Error('new PDF unexpectedly uses legacy page-content streams')
 const annots = reopened.getPages()[0].node.normalizedEntries().Annots
 if (annots.size()!==2) throw new Error('pre-existing PDF annotation was not preserved')
 let annotation = null
 for (let i=0;i<annots.size();i++) { const candidate=reopened.context.lookup(annots.get(i)); if (candidate.lookupMaybe(PDFName_default.of('PDFPingWheel'),PDFDict_default)) annotation=candidate }
 if (!annotation) throw new Error('native plugin annotation dictionary missing')
 if (annotation.lookup(PDFName_default.of('Subtype'), PDFName_default).toString() !== '/Stamp') throw new Error('annotation is not /Stamp')
 const ap = annotation.lookup(PDFName_default.of('AP'), PDFDict_default)
 const appearance = reopened.context.lookup(ap.lookup(PDFName_default.of('N')))
 if (!appearance.getContentsString().includes('/Im0 Do')) throw new Error('Stamp appearance does not draw its image')
 if (!annotation.lookup(PDFName_default.of('PDFPingWheel'), PDFDict_default)) throw new Error('annotation custom metadata missing')
 annotation.set(PDFName_default.of('Rect'), reopened.context.obj([100,200,136,236]))
 const moved = readPingPayload(reopened)
 if (moved.pings[0].x!==118 || moved.pings[0].y!==218) throw new Error('external Rect movement not restored')
 stripPluginArtifacts(reopened)
 if (readPingPayload(reopened).pings.length!==0) throw new Error('native annotation strip failed')
 if (reopened.getPages()[0].node.normalizedEntries().Annots.size()!==1) throw new Error('cleanup removed a pre-existing PDF annotation')
 if (countLegacyStreams(reopened)!==0) throw new Error('legacy stream unexpectedly remains')
 const rewritten = await reopened.save({updateMetadata:false})
 const finalDoc = await PDFDocument_default.load(rewritten)
 if (readPingPayload(finalDoc).found) throw new Error('clean working copy retained stale ping metadata')
 for (const type of STAMP_TYPES.map((p)=>p.id)) {
   const next = await buildSavedPdf(bytes,[{...ping,id:'id-'+type,type}], {[type]:TEST_PNG})
   const doc2 = await PDFDocument_default.load(next)
   const payload2=readPingPayload(doc2)
   if (payload2.pings.length!==1 || payload2.pings[0].type!==type) throw new Error('type roundtrip failure: '+type)
   if (payload2.pings.length!==1) throw new Error('Stamp missing for type: '+type)
 }
 const empty = await buildSavedPdf(bytes,[],{})
 const emptyDoc = await PDFDocument_default.load(empty)
 if (!readPingPayload(emptyDoc).found || readPingPayload(emptyDoc).pings.length!==0) throw new Error('empty v2 save failure')
 // Verify compatibility with v1 files: Info payload + tagged image content stream.
 const legacyBase = await PDFDocument_default.create()
 legacyBase.addPage([612,792]).drawText('LEGACY TEXT',{x:72,y:700})
 const legacy = await PDFDocument_default.load(await legacyBase.save())
 const legacyPage = legacy.getPages()[0]
 const legacyImage = await legacy.embedPng(TEST_PNG)
 legacyPage.drawImage(legacyImage,{x:150,y:380,width:36,height:36})
 legacyPage.contentStream.dict.set(PDFName_default.of('PDFPingWheel'),PDFName_default.of('Baked'))
 const info = legacy.context.obj({})
 legacy.context.trailerInfo.Info = legacy.context.register(info)
 info.set(PDFName_default.of('PDFPingWheel'),PDFHexString_default.fromText(JSON.stringify({v:1,pings:[{id:'old',page:0,x:168,y:398,type:'question'}]})))
 const oldDoc = await PDFDocument_default.load(await legacy.save())
 const oldPayload = readPingPayload(oldDoc)
 if (oldPayload.version!==1 || oldPayload.source!=='legacy-info' || oldPayload.pings[0].id!=='old') throw new Error('v1 compatibility read failed')
 if (countLegacyStreams(oldDoc)!==1) throw new Error('v1 baked stream missing')
 stripPluginArtifacts(oldDoc)
 if (countLegacyStreams(oldDoc)!==0 || readPingPayload(oldDoc).found) throw new Error('v1 compatibility cleanup failed')
 const portableEmote = Buffer.from(TEST_PNG).toString('base64')
 const emoteSaved = await buildSavedPdf(bytes,[{...ping,id:'portable-emote',type:'emote_thumb',assetData:portableEmote}], {emote_thumb:TEST_PNG})
 const emoteDoc = await PDFDocument_default.load(emoteSaved)
 const emotePayload = readPingPayload(emoteDoc)
 if (emotePayload.pings[0]?.assetData !== portableEmote) throw new Error('emote asset portability metadata missing')
 const noteText = '检查这里的计算步骤\\n第二行备注：确认单位'
 const noteStamp = {id:'note-roundtrip',page:0,x:210,y:330,type:'note',text:noteText,width:230,height:60}
 const noteStamp2 = {id:'note-roundtrip-2',page:0,x:410,y:220,type:'note',text:'第二条独立备注',width:180,height:42}
 const noteSaved = await buildSavedPdf(bytes,[noteStamp,noteStamp2], {[noteStamp.id]:TEST_PNG,[noteStamp2.id]:TEST_PNG})
 const noteDoc = await PDFDocument_default.load(noteSaved)
 const notePayload = readPingPayload(noteDoc)
 if (notePayload.pings.length!==2 || notePayload.pings.some((p)=>p.type!=='note')) throw new Error('multiple note Stamp annotations missing')
 if (notePayload.pings.find((p)=>p.id===noteStamp.id)?.text!==noteText) throw new Error('note text metadata roundtrip failed')
 if (notePayload.pings.find((p)=>p.id===noteStamp2.id)?.text!==noteStamp2.text) throw new Error('second note text metadata roundtrip failed')
 if (notePayload.pings.find((p)=>p.id===noteStamp.id)?.width!==230 || notePayload.pings.find((p)=>p.id===noteStamp.id)?.height!==60) throw new Error('note dimensions roundtrip failed')
 const noteAnnots = noteDoc.getPages()[0].node.normalizedEntries().Annots
 let noteAnnotation = null
 for (let i=0;i<noteAnnots.size();i++) { const candidate=noteDoc.context.lookup(noteAnnots.get(i)); const meta=candidate?.lookupMaybe?.(PDFName_default.of('PDFPingWheel'),PDFDict_default); if (meta && meta.lookup(PDFName_default.of('id')).decodeText()===noteStamp.id) noteAnnotation=candidate }
 if (!noteAnnotation || noteAnnotation.lookup(PDFName_default.of('Contents')).decodeText()!==noteText) throw new Error('note text missing from annotation Contents')
 return {savedBytes:saved.length, totalTypes:STAMP_TYPES.length, nativeStamp:true, emoteAssetPortable:true, persistentTextNotes:true, legacyV1:true, passed:true}
})()
`
const result = await vm.runInContext(test, ctx, { timeout: 30000 })
console.log('PASS PDF annotation verification:', JSON.stringify(result))
