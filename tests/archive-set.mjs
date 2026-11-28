import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { PDFDocument } from 'pdf-lib'
import { unpack } from '../dist/src/pdf-annotations.js'

export async function checkArchiveSet(page,downloadAnnotations,importAnnotations) {
  const pdf = await PDFDocument.create()
  pdf.addPage([438,627])
  pdf.addPage([438,627])
  const bytes = Buffer.from(await pdf.save())
  const mark = {id:'decision',type:'region',page:1,point:[.1,.1],size:[.3,.2],text:'Accepted correction',marginSide:'right',
    color:'#345677',set:'First review',author:'A. Rossi',tags:['Decision']}
  const comment = {id:'two-pages',type:'comment',page:1,text:'Read the full passage',color:'#345677',set:'First review',
    passages:[1,2].map(page=>({page,quote:'Passage on page '+page,rects:[[.2,.4,.2,.03]]}))}
  const source = {format:'margin-annotations',version:10,documentSha256:createHash('sha256').update(bytes).digest('hex'),
    sets:['First review','Later'],annotations:[mark,comment]}
  const transfer = data=>({name:'Review.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))})
  await page.locator('#file').setInputFiles({name:'Archive.pdf',mimeType:'application/pdf',buffer:bytes})
  await page.locator('#filename').filter({hasText:'Archive.pdf'}).waitFor()
  await importAnnotations(page,transfer(source),'2 added, 0 updated')
  const card = page.locator('.card').filter({hasText:mark.text})
  const manage = ()=>page.locator('#manage-sets').click()
  const dialog = page.locator('#sets-dialog'), active = dialog.locator('#active-set')
  const done = ()=>dialog.getByRole('button',{name:'Done',exact:true}).click()
  const snapshot = async()=>JSON.parse((await downloadAnnotations(page)).buffer)
  await card.locator('.more').click()
  await card.getByRole('button',{name:'Pin preview'}).click()
  await page.locator('#annotation-search').fill(mark.text)
  assert.equal(await page.locator('.card').count(),1)
  await manage()
  const visibleSet = dialog.getByRole('checkbox',{name:'First review',exact:true})
  const description = control=>control.evaluate(el=>document.getElementById(el.getAttribute('aria-describedby')).textContent)
  assert.equal(await description(visibleSet),'2 annotations')
  await active.selectOption({label:'First review'})
  await dialog.getByRole('button',{name:'Archive First review',exact:true}).click()
  assert.equal(await active.inputValue(),'My notes')
  assert.ok(await dialog.getByRole('button',{name:'Restore First review'}).evaluate(el=>el===document.activeElement))
  assert.equal(await description(dialog.getByRole('button',{name:'Restore First review'})),'2 annotations')
  assert.equal(await active.locator('option').allTextContents().then(values=>values.includes('First review')),false)
  await done()
  assert.equal(await card.count(),0)
  assert.ok(await page.locator('#note-preview').isHidden())
  assert.ok(await page.locator('#author-filter').isHidden())
  assert.equal(await page.locator('.paper.current .note-marker[data-id="decision"],.margin-note[data-id="decision"]').count(),0)
  const archived = {...source,archivedSets:['First review']}
  assert.deepEqual(await snapshot(),archived)
  await page.locator('#undo').click()
  await card.waitFor()
  await manage()
  assert.equal(await active.inputValue(),'First review')
  await done()
  await page.locator('#redo').click()
  await page.locator('#save-state').getByText('Saved locally',{exact:true}).waitFor()
  await page.reload()
  await page.locator('#writing-set').filter({hasText:'1 archived'}).waitFor()
  assert.deepEqual(await snapshot(),archived)
  const [download] = await Promise.all([page.waitForEvent('download'),page.locator('#export').click()])
  assert.deepEqual((await unpack(await readFile(await download.path()))).marks,[])
  await manage()
  await dialog.getByRole('button',{name:'Restore First review'}).click()
  assert.equal(await description(visibleSet),'2 annotations')
  assert.ok(await dialog.getByRole('checkbox',{name:'First review'}).isChecked())
  assert.equal(await active.inputValue(),'My notes')
  await done()
  assert.deepEqual(await snapshot(),source)
  await importAnnotations(page,transfer(archived),'Archived 1 set')
  assert.equal(await card.count(),0)
  await importAnnotations(page,transfer(source),'already in this document')
  assert.deepEqual(await snapshot(),archived)
}
