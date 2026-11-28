import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile,writeFile } from 'node:fs/promises'
import { inflateSync } from 'node:zlib'
import { PDFDocument, PDFName, PDFNumber, degrees } from 'pdf-lib'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { exportDocument,unpack } from '../dist/src/pdf-annotations.js'
import { markupStrokes } from '../dist/src/markup.js'

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

test('region comments export as hollow squares aligned to rotated crops and reopen as editable regions',async()=>{
  const doc = await PDFDocument.create()
  const rotations = [0,90,180,270]
  const marks = rotations.map((angle,i)=>{
    const page = doc.addPage([350,500])
    page.setCropBox(17,41,280,420)
    page.setRotation(degrees(angle))
    page.node.set(PDFName.of('UserUnit'),PDFNumber.of(2))
    return {id:'box-'+angle,type:'region',page:i+1,point:[.15,.3],size:[.22,.18],color:'#804231',text:'Caffè — 図',done:true}
  })
  const original = await doc.save()
  const pdf = await getDocument({...opts,data:original.slice()}).promise
  try {
    const views = await Promise.all(marks.map(async mark=>(await pdf.getPage(mark.page)).getViewport({scale:1})))
    const bytes = await exportDocument(original,marks,n=>views[n-1])
    const native = await PDFDocument.load(bytes)
    const key = PDFName.of
    for (const [i,view] of views.entries()) {
      const dict = native.getPage(i).node.Annots().lookup(0)
      assert.equal(dict.lookup(key('Subtype')).decodeText(),'Square')
      assert.equal(dict.lookup(key('Contents')).decodeText(),'Done: Caffè — 図')
      const [a,b] = view.convertToPdfPoint(.15*view.width,.3*view.height)
      const [c,d] = view.convertToPdfPoint(.37*view.width,.48*view.height)
      const expected = [Math.min(a,c),Math.min(b,d),Math.max(a,c),Math.max(b,d)]
      dict.lookup(key('Rect')).asArray().forEach((val,j)=>assert.ok(Math.abs(val.asNumber()-expected[j])<.0001))
      const ops = inflateSync(dict.lookup(key('AP')).lookup(key('N')).getContents()).toString()
      assert.match(ops,/h S/)
      assert.doesNotMatch(ops,/\bf\b/)
    }
    const restored = await unpack(bytes)
    assert.deepEqual(restored.marks,marks)
    const clean = await PDFDocument.load(restored.bytes)
    assert.ok(clean.getPages().every(p=>p.node.Annots().size()===0))
  } finally { await pdf.destroy() }
})

test('text markup exports native appearances aligned to cropped and rotated pages', async () => {
  const doc = await PDFDocument.create()
  const page = doc.addPage([400,600])
  page.setCropBox(30,40,300,400)
  page.setRotation(degrees(90))
  page.node.set(PDFName.of('UserUnit'),PDFNumber.of(2))
  const source = await doc.save()
  const pdf = await getDocument({...opts,data:source.slice()}).promise
  try {
    const viewport = (await pdf.getPage(1)).getViewport({scale:1})
    const rects = [[.1,.2,.1,.04],[.201,.2,.1,.04],[.75,.2,.08,.04],[.1,.3,.15,.04]]
    const styles = ['underline','dashed-underline','dotted-underline','strikethrough','outline-box']
    const marks = styles.map(style=>({id:style,type:'highlight',style,rects,page:1,color:'#34803a',text:'Selected words'}))
    const bytes = await exportDocument(source,marks,()=>viewport)
    const output = await PDFDocument.load(bytes)
    const dicts = output.getPage(0).node.Annots()
    const key = PDFName.of
    for (const [i,style] of styles.entries()) {
      const dict = dicts.lookup(i)
      const subtype = ['Underline','Underline','Underline','StrikeOut','Square'][i]
      assert.equal(dict.lookup(key('Subtype')).decodeText(),subtype)
      if (subtype !== 'Square') {
        const quads = dict.lookup(key('QuadPoints')).asArray().map(n=>n.asNumber())
        assert.equal(quads.length,rects.length*8)
        assert.deepEqual(quads.slice(0,2),viewport.convertToPdfPoint(.1*viewport.width,.2*viewport.height))
      }
      const stream = dict.lookup(key('AP')).lookup(key('N'))
      const ops = inflateSync(stream.getContents()).toString()
      assert.doesNotMatch(ops,/\bh f\b/)
      const strokes = [...markupStrokes(rects,viewport.width,viewport.height,style)]
      assert.equal(strokes.length,3,'Join neighboring text runs only')
      assert.equal((ops.match(/^S$|^h S$/gm) ?? []).length,3)
      const {points,thickness} = strokes[0]
      if (style === 'outline-box') assert.match(ops,/h S/)
      else {
        assert.equal(points[0][1],points[1][1])
        const y = style === 'strikethrough' ? (.2+.04*.52)*viewport.height : .24*viewport.height-thickness/2
        assert.ok(Math.abs(points[0][1]-y)<.00001)
      }
      const first = viewport.convertToPdfPoint(...points[0]).map(x=>Number(x.toFixed(4))).join(' ')
      assert.ok(ops.includes(first+' m'))
      if (style === 'dotted-underline') assert.match(ops,/\[[\d.]+ [\d.]+\] 0 d 1 J/)
      else if (style === 'dashed-underline') assert.match(ops,/\[[\d.]+ [\d.]+\] 0 d 0 J/)
      else assert.match(ops,/\[\] 0 d 0 J/)
    }
    assert.deepEqual((await unpack(bytes)).marks,marks)
  } finally { await pdf.destroy() }
})

test('a passage spanning two PDF pages is one editable comment with native highlights on both pages', async () => {
  const original = await PDFDocument.create()
  for (let i=0;i<2;i++) original.addPage([400,600])
  const marks = [{id:'shared',type:'comment',page:1,color:'#91b9dd',text:'Check units — 注釈',done:true,
    passages:[1,2].map(page=>({page,quote:'Selected text ' + page,rects:[[.1,.2,.3,.04]]}))}]
  const pdf = await getDocument({...opts,data:await original.save()}).promise
  const bytes = await exportDocument(await original.save(),marks,async n=>(await pdf.getPage(n)).getViewport({scale:1}))
  const reopened = await getDocument({...opts,data:bytes.slice()}).promise
  for (const number of [1,2]) {
    const [highlight] = await (await reopened.getPage(number)).getAnnotations()
    assert.equal(highlight.subtype,'Highlight')
    assert.equal(highlight.contentsObj.str,'Done: ' + marks[0].text)
  }
  const restored = await unpack(bytes)
  assert.deepEqual(restored.marks,marks)
  const clean = await PDFDocument.load(restored.bytes)
  for (const page of clean.getPages()) assert.equal(page.node.Annots().size(),0)
  const styled = [{...marks[0],style:'outline-box'}]
  const outlined = await exportDocument(await original.save(),styled,async n=>(await pdf.getPage(n)).getViewport({scale:1}))
  const annotated = await PDFDocument.load(outlined)
  for (const page of annotated.getPages()) {
    const annotation = page.node.Annots().lookup(0)
    assert.equal(annotation.lookup(PDFName.of('Subtype')).decodeText(),'Square')
    assert.ok(annotation.lookup(PDFName.of('AP')))
  }
  assert.deepEqual((await unpack(outlined)).marks,styled)
  await Promise.all([pdf.destroy(),reopened.destroy()])
})

test('the sharing PDF carries the readable discussion and editable reply ancestry without superseded versions',async()=>{
  const source = await PDFDocument.create()
  source.addPage([300,450])
  const bytes = await source.save()
  const pdf = await getDocument({...opts,data:bytes.slice()}).promise
  try {
    const viewport = (await pdf.getPage(1)).getViewport({scale:1})
    const at = '2026-01-01T00:00:00.000Z'
    const shared = {id:'root',type:'note',page:1,point:[.2,.3],color:'#aaccee',text:'Approved',author:'Lea',
      replies:[{id:'r1',text:'Is it checked?',author:'Mia',at},{id:'r2',parent:'r1',text:'Yes',author:'Jon',at}]}
    const history = {enabled:true,versions:[{id:'v1',text:'Withdrawn draft',at}]}
    const first = await exportDocument(bytes,[{...shared,history}],()=>viewport)
    const native = (await PDFDocument.load(first)).getPage(0).node.Annots().lookup(0)
    assert.match(native.lookup(PDFName.of('Contents')).decodeText(),/Reply #2 to #1 · Jon/)
    assert.doesNotMatch(native.lookup(PDFName.of('MarginData')).decodeText(),/Withdrawn draft|history/)
    const clean = await unpack(first)
    assert.deepEqual(clean.marks,[shared])
    const second = await exportDocument(clean.bytes,clean.marks,()=>viewport)
    assert.equal((await PDFDocument.load(second)).getPage(0).node.Annots().size(),1)
    assert.deepEqual((await unpack(second)).marks,[shared])
  } finally { await pdf.destroy() }
})
