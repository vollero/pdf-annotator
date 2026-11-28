import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { PDFDocument, PDFName } from 'pdf-lib'

export async function checkCommentDetails(page,downloadAnnotations,importAnnotations) {
  const pdf = await PDFDocument.create()
  pdf.addPage([481,632])
  const bytes = Buffer.from(await pdf.save())
  const comment = {id:'source',page:1,type:'comment',color:'#3377aa',text:'Check the scale.',
    passages:[{page:1,quote:'Figure 1',rects:[[.2,.2,.15,.03]]}]}
  const json = {format:'margin-annotations',version:3,documentSha256:createHash('sha256').update(bytes).digest('hex'),annotations:[comment]}
  const open = async(name,buffer)=>{
    await page.locator('#file').setInputFiles({name,mimeType:'application/pdf',buffer})
    await page.locator('#filename').filter({hasText:name}).waitFor()
  }
  const snapshot = async()=>JSON.parse((await downloadAnnotations(page)).buffer)
  const edit = async()=>{
    const card = page.locator('.card').filter({has:page.locator('[data-id="source"].card-body')})
    await card.locator('.more').click()
    await card.getByRole('button',{name:'Edit comment'}).click()
  }
  await open('Comments.pdf',bytes)
  await importAnnotations(page,{name:'Details.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(json))},'1 added, 0 updated')
  await edit()
  await page.locator('#note-author').fill('Léa Martin')
  await page.locator('#remember-author').check()
  await page.locator('#note-tags').fill('Methods, #needs evidence, METHODS')
  await page.locator('#note-save').click()
  const withDetails = {...comment,author:'Léa Martin',tags:['Methods','needs evidence']}
  assert.deepEqual(await snapshot(),{...json,version:10,sets:[],annotations:[withDetails]})
  await page.locator('#undo').click()
  assert.deepEqual(await snapshot(),json)
  await page.locator('#redo').click()
  await page.locator('button[data-tool="note"]').click()
  await page.locator('.paper.current[data-ready="true"]').click({position:{x:155,y:115}})
  assert.equal(await page.locator('#note-author').inputValue(),'Léa Martin')
  await page.locator('#note-author').fill('Jon')
  await page.locator('#note-text').fill('Second note')
  await page.locator('#note-save').click()
  await page.getByLabel('Filter by tag').selectOption({label:'needs evidence'})
  assert.equal(await page.locator('.card').count(),1)
  await page.getByLabel('Filter by author').selectOption({label:'Jon'})
  assert.equal(await page.locator('.card').count(),0)
  await page.getByLabel('Filter by author').selectOption('')
  await page.locator('#annotation-search').fill('léa #methods')
  assert.equal(await page.locator('.card').count(),1)
  await page.locator('#annotation-search').fill('')
  const [download] = await Promise.all([page.waitForEvent('download'),page.locator('#export').click()])
  const annotated = await readFile(await download.path())
  const native = (await PDFDocument.load(annotated)).getPage(0).node.Annots().lookup(0)
  assert.equal(native.lookup(PDFName.of('T')).decodeText(),'Léa Martin')
  assert.equal(native.lookup(PDFName.of('Contents')).decodeText(),'Check the scale.\n\nTags: Methods, needs evidence')
  await open('Comments annotated.pdf',annotated)
  assert.deepEqual((await snapshot()).annotations.find(mark=>mark.id==='source'),withDetails)
  await edit()
  await page.locator('#note-author').fill('')
  await page.locator('#note-tags').fill('')
  await page.locator('#remember-author').check()
  await page.locator('#note-save').click()
  assert.deepEqual((await snapshot()).annotations.find(mark=>mark.id==='source'),comment)
}
