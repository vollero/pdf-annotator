import { editTime } from './dated-edit.mjs'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { PDFDocument, PDFName, degrees } from 'pdf-lib'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

export async function checkNoteResize(page, downloadAnnotations, importAnnotations) {
  const doc = await PDFDocument.create()
  const first = doc.addPage([420,600])
  first.setCropBox(30,40,320,480)
  first.setRotation(degrees(90))
  const bytes = Buffer.from(await doc.save())
  const note = {type:'note',page:1,id:'size',point:[.1,.15],color:'#579ac3',done:false,
    text:'Caffè — 注釈\nVerify the sample size before publication.'}
  const comment = {type:'comment',page:1,id:'fixed',color:'#deb751',text:'Check reference.',
    passages:[{page:1,quote:'Reference',rects:[[.7,.72,.12,.04]]}]}
  const data = {format:'margin-annotations',version:3,documentSha256:createHash('sha256').update(bytes).digest('hex'),
    annotations:[note,comment]}
  const open = async (name,pdf) => {
    await page.locator('#file').setInputFiles({name,mimeType:'application/pdf',buffer:pdf})
    await page.locator('#filename').filter({hasText:name}).waitFor()
  }
  await open('Box review.pdf',bytes)
  await importAnnotations(page,{name:'Boxes.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))},'2 added, 0 updated')
  const paper = page.locator('.paper.current[data-ready="true"]')
  const marker = paper.locator('.point-note[data-id="size"]')
  const handle = marker.locator('.note-resize-handle')
  assert.equal(await paper.locator('.note-resize-handle').count(),1)
  const startDrag = async () => {
    await handle.scrollIntoViewIfNeeded()
    const box = await handle.boundingBox()
    const x = box.x+box.width*.72, y = box.y+box.height*.72
    await page.mouse.move(x,y)
    await page.mouse.down()
    return {x,y}
  }
  let start = await startDrag()
  await page.mouse.move(start.x+65,start.y+35,{steps:4})
  await paper.locator('.expanded-note .page-note-text').waitFor()
  await page.keyboard.press('Escape')
  await page.mouse.up()
  assert.equal(await marker.locator('.page-note-text').count(),0)
  const bounds = await paper.boundingBox()
  start = await startDrag()
  await page.mouse.move(start.x+bounds.width*.4,start.y+bounds.height*.32,{steps:4})
  await page.mouse.up()
  const body = marker.locator('.page-note-text')
  assert.equal(await body.textContent(),'To do · '+note.text)
  const exported = await downloadAnnotations(page)
  const transfer = JSON.parse(exported.buffer)
  const size = transfer.annotations[0].size
  assert.equal(transfer.version,12)
  assert.deepEqual(transfer.annotations,[{...note,size,updatedAt:editTime(transfer.annotations[0])},comment])
  assert.ok(Math.abs(size[0]-(18/480+.4))<.005 && Math.abs(size[1]-(18/320+.32))<.005)
  await page.locator('#undo').click()
  assert.equal(await marker.locator('.page-note-text').count(),0)
  await page.locator('#redo').click()
  await body.waitFor()
  await marker.focus()
  await page.keyboard.press('Shift+ArrowRight')
  const wider = JSON.parse((await downloadAnnotations(page)).buffer).annotations[0].size
  assert.ok(Math.abs(wider[0]-size[0]-12/480)<.00001)
  assert.equal(wider[1],size[1])
  await page.locator('#zoom-in').click()
  start = await startDrag()
  await page.mouse.move(start.x-bounds.width*.7,start.y-bounds.height*.6,{steps:4})
  await page.mouse.up()
  const compact = JSON.parse((await downloadAnnotations(page)).buffer)
  assert.deepEqual(compact,{...data,version:12,sets:[],annotations:[{...note,updatedAt:editTime(compact.annotations[0])},comment]})
  await importAnnotations(page,exported,'0 added, 1 updated')
  await page.locator('#save-state').getByText('Saved locally',{exact:true}).waitFor()
  await page.reload()
  await body.waitFor()
  assert.deepEqual(JSON.parse((await downloadAnnotations(page)).buffer),transfer)
  const [download] = await Promise.all([page.waitForEvent('download'),page.locator('#export').click()])
  const pdfBytes = await readFile(await download.path())
  const native = await PDFDocument.load(pdfBytes)
  const annotation = native.getPage(0).node.Annots().lookup(0)
  const rect = annotation.lookup(PDFName.of('Rect')).asArray().map(n=>n.asNumber())
  const x = 30+note.point[1]*320, y = 40+note.point[0]*480
  const expectedRect = [x,y,x+size[1]*320,y+size[0]*480]
  expectedRect.forEach((value,i)=>assert.ok(Math.abs(rect[i]-value)<.001))
  assert.equal(annotation.lookup(PDFName.of('Subtype')).decodeText(),'FreeText')
  assert.equal(annotation.lookup(PDFName.of('Contents')).decodeText(),'To do: '+note.text)
  // Render the exported bytes directly, without the editor's overlay or MarginData.
  const reader = await getDocument({data:new Uint8Array(pdfBytes),isEvalSupported:false}).promise
  try {
    const pdfPage = await reader.getPage(1)
    const viewport = pdfPage.getViewport({scale:1})
    const {canvas,context} = reader.canvasFactory.create(viewport.width,viewport.height)
    await pdfPage.render({canvas,viewport}).promise
    const {data:pixels} = context.getImageData(54,54,155,80)
    let ink = 0
    for (let i=0;i<pixels.length;i+=4) if (pixels[i]<100 && pixels[i+1]<100 && pixels[i+2]<100) ink++
    assert.ok(ink>50,'Text is visible inside the exported box on the rotated page')
  } finally { await reader.destroy() }
  await open('Expanded notes.pdf',pdfBytes)
  await body.waitFor()
  assert.deepEqual(JSON.parse((await downloadAnnotations(page)).buffer).annotations,transfer.annotations)
}
