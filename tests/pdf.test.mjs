import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile,writeFile } from 'node:fs/promises'
import { PDFDocument, PDFName, PDFNumber, degrees } from 'pdf-lib'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { exportDocument,unpack } from '../dist/src/pdf-annotations.js'

const opts={disableFontFace:true,isEvalSupported:false}
test('native comments round-trip with crop, rotation, Unicode and existing annotations',async()=>{
  const doc=await PDFDocument.create()
  const page=doc.addPage([400,600])
  page.setCropBox(30,40,300,400)
  page.setRotation(degrees(90))
  page.node.set(PDFName.of('UserUnit'),PDFNumber.of(2))
  const existing=doc.context.obj({Type:'Annot',Subtype:'Text',Rect:[30,40,50,60],Contents:'Existing'})
  page.node.addAnnot(doc.context.register(existing))
  const source=await doc.save()
  const pdf=await getDocument({...opts,data:source.slice()}).promise
  const viewport=(await pdf.getPage(1)).getViewport({scale:1})
  const marks=[
    {id:'h',type:'highlight',color:'#efc650',rects:[[.1,.2,.3,.04],[.2,.3,.2,.04]],text:'Selected text',page:1},
    {id:'d',type:'draw',color:'#9abd9e',points:[[.12,.3],[.22,.35]],text:'Freehand drawing',page:1},
    {id:'n',type:'note',color:'#91b9dd',point:[.4,.5],text:'Caffè — 注釈',page:1}
  ]
  marks.push({...marks[2],id:'a',done:false}, {...marks[2],id:'b',done:true})
  assert.equal(viewport.userUnit,2)
  const bytes=await exportDocument(source,marks,()=>viewport)
  const reopened=await getDocument({...opts,data:bytes.slice()}).promise
  const annotations=await (await reopened.getPage(1)).getAnnotations()
  assert.deepEqual(annotations.map(a=>a.subtype),['Text','Highlight','Ink','Text','Text','Text'])
  assert.equal(annotations[3].contentsObj.str,marks[2].text)
  assert.equal(annotations[4].contentsObj.str,'To do: ' + marks[2].text)
  assert.equal(annotations[5].contentsObj.str,'Done: ' + marks[2].text)
  assert.equal((await reopened.getMetadata()).info.Custom.MarginEditor,'1')
  const raw=await PDFDocument.load(bytes)
  const dicts=raw.getPage(0).node.Annots()
  assert.deepEqual(dicts.lookup(1).get(PDFName.of('QuadPoints')).asArray().map(v=>v.asNumber()).slice(0,2),
    viewport.convertToPdfPoint(viewport.width*.1,viewport.height*.2))
  assert.ok(dicts.lookup(2).get(PDFName.of('AP')))
  const unpacked=await unpack(bytes)
  assert.deepEqual(unpacked.marks,marks)
  const clean=await PDFDocument.load(unpacked.bytes)
  assert.equal(clean.getPage(0).node.Annots().size(),1)
  await Promise.all([pdf.destroy(),reopened.destroy()])
})

test('bundled sample exports as a three-page annotated PDF',async()=>{
  const bytes=new Uint8Array(await readFile('extension/assets/reading-the-alps.pdf'))
  const marks=JSON.parse(await readFile('extension/assets/sample-annotations.json','utf8'))
  const pdf=await getDocument({...opts,data:bytes.slice()}).promise
  const out=await exportDocument(bytes,marks,async n=>(await pdf.getPage(n)).getViewport({scale:1}))
  const doc=await PDFDocument.load(out)
  assert.equal(doc.getPageCount(),3)
  assert.equal(doc.getPage(0).node.Annots().size(),2)
  assert.equal(doc.getPage(1).node.Annots().size(),1)
  if(process.env.MARGIN_TEST_EXPORT) await writeFile(process.env.MARGIN_TEST_EXPORT,out)
  await pdf.destroy()
})
