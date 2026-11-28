import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { degrees, PDFDocument, PDFName } from 'pdf-lib'

export async function checkNoteMove(page, downloadAnnotations, importAnnotations) {
  const pdf = await PDFDocument.create()
  pdf.addPage([400,240])
  const rotated = pdf.addPage([300,500])
  rotated.setCropBox(20,40,230,400)
  rotated.setRotation(degrees(90))
  const bytes = Buffer.from(await pdf.save())
  const edge = {id:'edge',page:1,type:'note',point:[1,1],color:'#123456',text:'At the edge.'}
  const note = {id:'units',page:2,type:'note',point:[.22,.28],color:'#876543',text:'Check the units.',done:true}
  const comment = {id:'quote',page:2,type:'comment',color:'#445566',text:'Keep this quote.',
    passages:[{page:2,quote:'Measurement',rects:[[.55,.18,.18,.05]]}]}
  const source = {format:'margin-annotations',version:3,documentSha256:createHash('sha256').update(bytes).digest('hex'),
    annotations:[edge,note,comment]}
  const file = {name:'Review.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(source))}
  const open = async (name,buffer) => {
    await page.locator('#file').setInputFiles({name,mimeType:'application/pdf',buffer})
    await page.locator('#filename').filter({hasText:name}).waitFor()
  }
  const saved = () => page.locator('#save-state').getByText('Saved locally',{exact:true}).waitFor()
  const snapshot = async () => JSON.parse((await downloadAnnotations(page)).buffer)
  await open('Field review.pdf',bytes)
  await importAnnotations(page,file,'3 added, 0 updated')
  await saved()
  await page.reload()
  const edgeMarker = page.locator('.paper.current .note-marker[data-id="edge"]')
  await edgeMarker.waitFor()
  assert.equal(await edgeMarker.getAttribute('transform'),'translate(382 222)')
  await page.locator('#next').click()
  const paper = page.locator('.paper[data-page="2"][data-ready="true"]')
  const marker = paper.locator('.note-marker[data-id="units"]')
  const before = await marker.getAttribute('transform')
  await page.locator('#zoom-in').click()
  await marker.waitFor()
  const editor = page.getByRole('dialog',{name:'Edit note'})
  const press = async () => {
    const box = await marker.boundingBox()
    // Grab away from the top-left corner so a jump to the pointer would be observable.
    const x = Math.round(box.x+box.width*.7), y = Math.round(box.y+box.height*.4)
    await page.mouse.move(x,y)
    await page.mouse.down()
    return {x,y}
  }
  let start = await press()
  await page.mouse.move(start.x+2,start.y)
  await page.mouse.up()
  await editor.waitFor()
  assert.equal(await editor.locator('textarea').inputValue(),note.text)
  await editor.getByRole('button',{name:'Cancel'}).click()
  start = await press()
  await page.mouse.move(start.x+64,start.y+33,{steps:4})
  assert.notEqual(await marker.getAttribute('transform'),before)
  await page.keyboard.press('Escape')
  await page.mouse.up()
  assert.equal(await marker.getAttribute('transform'),before)
  assert.ok(await editor.isHidden())
  assert.ok(await page.locator('#undo').isDisabled())

  start = await press()
  const bounds = await paper.boundingBox()
  const dx = Math.round(bounds.width*.2), dy = Math.round(bounds.height*.12)
  await page.mouse.move(start.x+dx,start.y+dy,{steps:8})
  await page.mouse.up()
  assert.ok(await editor.isHidden())
  const migrated = await downloadAnnotations(page)
  const data = JSON.parse(migrated.buffer), moved = data.annotations[1]
  assert.ok(Math.abs(moved.point[0]-note.point[0]-dx/bounds.width)<.0001)
  assert.ok(Math.abs(moved.point[1]-note.point[1]-dy/bounds.height)<.0001)
  assert.deepEqual(data,{...source,annotations:[edge,{...note,point:moved.point},comment]})
  await page.locator('#undo').click()
  assert.equal(await marker.getAttribute('transform'),before)
  assert.ok(await page.locator('#undo').isDisabled(),'One drag adds one history entry')
  await page.locator('#redo').click()
  const after = await marker.getAttribute('transform')
  await page.locator('#fit').click()
  assert.equal(await marker.getAttribute('transform'),after)
  await saved()
  await page.reload()
  await edgeMarker.waitFor()
  await page.locator('#page-layout').selectOption('continuous')
  await page.locator('#next').click()
  await marker.waitFor()
  assert.equal(await marker.getAttribute('transform'),after)
  const quoteMarker = paper.locator('.note-marker[data-id="quote"]')
  await quoteMarker.click()
  await page.getByRole('dialog',{name:'Comment on passage'}).getByRole('button',{name:'Cancel'}).click()
  const visible = await paper.boundingBox()
  await press()
  await page.mouse.move(visible.x+visible.width*.5,visible.y-20,{steps:6})
  await page.mouse.up()
  const clamped = (await snapshot()).annotations[1]
  assert.equal(clamped.page,2)
  assert.equal(clamped.point[1],0)
  await importAnnotations(page,migrated,'0 added, 1 updated')
  assert.equal(await marker.getAttribute('transform'),after)

  const [download] = await Promise.all([page.waitForEvent('download'),page.locator('#export').click()])
  const exported = await readFile(await download.path())
  const result = await PDFDocument.load(exported)
  const annotations = result.getPage(1).node.Annots()
  assert.equal(annotations.size(),2)
  const rect = annotations.lookup(0).lookup(PDFName.of('Rect')).asArray().map(n=>n.asNumber())
  // For this 90-degree crop, displayed (x,y) maps to PDF (20+y,40+x).
  const x = 20+moved.point[1]*230, y = 40+moved.point[0]*400
  const expectedRect = [x,y,x+18,y+18]
  expectedRect.forEach((value,i)=>assert.ok(Math.abs(rect[i]-value)<.001))
  await open('Moved notes.pdf',exported)
  assert.deepEqual((await snapshot()).annotations,data.annotations)
  await page.locator('#page-layout').selectOption('single')
  await page.locator('#next').click()
  await marker.waitFor()

  // Another tab can repaint a note while the pointer is still holding its marker.
  const other = await page.context().newPage()
  try {
    await other.goto(page.url())
    const card = other.locator('.card').filter({hasText:note.text})
    await card.locator('.more').click()
    await card.getByRole('button',{name:'Edit note',exact:true}).click()
    await other.locator('#note-text').fill('Units verified.')
    await page.bringToFront()
    start = await press()
    await page.mouse.move(start.x+25,start.y+15)
    await other.locator('#note-save').evaluate(button=>button.click())
    await page.locator('.card-body').filter({hasText:'Units verified.'}).waitFor()
    await page.mouse.move(start.x+53,start.y+31)
    await page.mouse.up()
    const updated = (await snapshot()).annotations[1]
    assert.notDeepEqual(updated.point,moved.point)
    assert.deepEqual(updated,{...moved,text:'Units verified.',point:updated.point})
    await saved()
    await other.reload()
    await other.locator('.card-body').filter({hasText:'Units verified.'}).waitFor()
    assert.deepEqual(JSON.parse((await downloadAnnotations(other)).buffer).annotations[1],updated)
  } finally { await other.close() }

  const touch = await page.context().newCDPSession(page)
  try {
    await touch.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1})
    await page.bringToFront()
    await marker.scrollIntoViewIfNeeded()
    const pointerEvents = await page.evaluateHandle(()=>{
      const events = []
      for (const name of ['pointerdown','pointermove','pointercancel','pointerup','lostpointercapture']) {
        window.addEventListener(name,event=>{
          if (event.pointerType==='touch') events.push([name,event.target.tagName,event.target.getAttribute('class')])
        },{capture:true})
      }
      return events
    })
    const box = await marker.boundingBox(), x = box.x+box.width/2, y = box.y+box.height/2
    const previous = await marker.getAttribute('transform')
    await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]})
    await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+48,y:y+30}]})
    await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})
    assert.notEqual(await marker.getAttribute('transform'),previous,JSON.stringify(await pointerEvents.jsonValue()))
    assert.ok(await editor.isHidden())
  } finally {
    await touch.send('Emulation.setTouchEmulationEnabled',{enabled:false})
    await touch.detach()
  }
}
