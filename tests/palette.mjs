import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PDFDocument, PDFName } from 'pdf-lib'

export async function checkPalette(page, downloadAnnotations, importAnnotations) {
  const doc = await PDFDocument.create()
  const line = 'Confirm the revised values.'
  doc.addPage([460,240]).drawText(line,{x:32,y:185,size:16})
  const open = async (name,buffer) => {
    await page.locator('#file').setInputFiles({name,mimeType:'application/pdf',buffer})
    await page.locator('#filename').filter({hasText:name}).waitFor()
    await page.locator('.paper.current[data-ready="true"]').waitFor()
  }
  await open('Color review.pdf',Buffer.from(await doc.save()))
  const palette = page.getByRole('dialog',{name:'Annotation palette'})
  const edit = () => page.getByRole('button',{name:'Edit palette'}).click()
  const entries = palette.getByLabel('Saved colors')
  const hex = palette.getByLabel('Hex color')
  const save = palette.getByRole('button',{name:'Save and use'})
  const warm = page.getByRole('button',{name:'Needs review annotation color'})
  const value = '#123abc'
  await edit()
  await entries.selectOption('')
  await palette.getByLabel('Color name').fill('Needs review')
  await hex.fill('xyz')
  await save.click()
  assert.ok(await hex.evaluate(el=>!el.validity.valid))
  await hex.fill('#efc650')
  await save.click()
  await palette.getByRole('alert').filter({hasText:'already in your palette'}).waitFor()
  await hex.fill('123ABC')
  assert.equal(await palette.getByLabel('Choose a color').inputValue(),value)
  if (process.env.MARGIN_PALETTE_PREVIEW_PATH) {
    await palette.screenshot({path:process.env.MARGIN_PALETTE_PREVIEW_PATH,animations:'disabled'})
  }
  await save.click()
  await warm.waitFor()
  assert.equal(await warm.getAttribute('aria-pressed'),'true')
  assert.equal(await page.locator('.swatch').count(),5)
  await page.reload()
  await page.locator('.paper.current[data-ready="true"]').waitFor()
  assert.equal(await warm.getAttribute('aria-pressed'),'true')
  await edit()
  assert.equal(await entries.locator('option').count(),7)
  await palette.getByLabel('Choose a color').fill('#112233')
  assert.equal(await hex.inputValue(),'#112233')
  await page.keyboard.press('Escape')
  assert.equal(await warm.getAttribute('title'),'Needs review ('+value+')')

  const paper = page.locator('.paper.current')
  for (const [index,tool] of ['highlight','draw','note'].entries()) {
    await page.locator('button[data-tool="'+tool+'"]').click()
    const box = await paper.boundingBox()
    const x = box.x+box.width*.25, y = box.y+box.height*(.40+.1*index)
    await page.mouse.move(x,y)
    await page.mouse.down()
    if (tool !== 'note') await page.mouse.move(x+50,y+12,{steps:4})
    await page.mouse.up()
    if (tool === 'note') {
      await page.locator('#note-text').fill('Confirm the units.')
      await page.locator('#note-save').click()
    }
  }
  await page.locator('button[data-tool="select"]').click()
  await paper.locator('.textLayer span').filter({hasText:line}).first().evaluate(el=>{
    getSelection().selectAllChildren(el)
  })
  await page.getByRole('group',{name:'Selected passage'}).getByRole('button',{name:'Comment'}).click()
  await page.locator('#note-text').fill('Verify this passage.')
  await page.locator('#note-save').click()
  const backup = await downloadAnnotations(page)
  const data = JSON.parse(backup.buffer)
  assert.deepEqual(data.annotations.map(m=>m.type),['highlight','draw','note','comment'])
  assert.equal(data.version,12)
  for (const mark of data.annotations) {
    assert.equal(new Date(mark.createdAt).toISOString(),mark.createdAt)
    assert.equal(mark.updatedAt,mark.createdAt)
  }
  assert.ok(data.annotations.every(m=>m.color===value))
  assert.ok(!backup.buffer.toString().includes('Needs review'))

  // A simultaneous addition in a second editor must survive saving an already-open editor.
  await edit()
  const other = await page.context().newPage()
  try {
    await other.goto(page.url())
    await other.getByRole('button',{name:'Edit palette'}).click()
    const otherPalette = other.getByRole('dialog',{name:'Annotation palette'})
    await otherPalette.getByLabel('Saved colors').selectOption('')
    await otherPalette.getByLabel('Hex color').fill('#772244')
    await otherPalette.getByRole('button',{name:'Save and use'}).click()
    await otherPalette.waitFor({state:'hidden'})
    await palette.getByLabel('Color name').fill('Resolved')
    await hex.fill('#119966')
    await save.click()
    await other.getByRole('button',{name:'Resolved annotation color'}).waitFor()
    await edit()
    assert.equal(await entries.locator('option[value="#772244"]').count(),1)
    await palette.getByRole('button',{name:'Remove color'}).click()
    await page.getByRole('button',{name:'#772244 annotation color'}).waitFor()
  } finally { await other.close() }
  await edit()
  await palette.getByRole('button',{name:'Restore defaults'}).click()
  await palette.waitFor({state:'hidden'})
  assert.equal(await page.getByRole('button',{name:'Amber annotation color'}).getAttribute('aria-pressed'),'true')
  assert.deepEqual(JSON.parse((await downloadAnnotations(page)).buffer),data)
  const card = page.locator('.card').filter({hasText:'Confirm the units.'})
  await card.locator('.more').click()
  await card.getByRole('button',{name:'Delete'}).click()
  await importAnnotations(page,backup,'1 added, 0 updated')
  const [download] = await Promise.all([page.waitForEvent('download'),page.locator('#export').click()])
  const exported = await readFile(await download.path())
  const annotated = await PDFDocument.load(exported)
  const dicts = annotated.getPage(0).node.Annots()
  assert.equal(dicts.size(),4)
  for (let i=0;i<dicts.size();i++) {
    const rgb = dicts.lookup(i).lookup(PDFName.of('C')).asArray().map(n=>Math.round(n.asNumber()*255))
    assert.deepEqual(rgb,[0x12,0x3a,0xbc])
  }
  await open('Color review-annotated.pdf',exported)
  const reopened = JSON.parse((await downloadAnnotations(page)).buffer)
  assert.deepEqual(reopened.annotations.sort((a,b)=>a.id.localeCompare(b.id)),data.annotations.sort((a,b)=>a.id.localeCompare(b.id)))
}
