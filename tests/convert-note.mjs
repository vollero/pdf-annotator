import { editTime } from './dated-edit.mjs'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { PDFDocument, PDFName, degrees } from 'pdf-lib'

export async function checkNoteConversion(page, downloadAnnotations, importAnnotations) {
  const pdf = await PDFDocument.create()
  pdf.addPage([500,300])
  const second = pdf.addPage([330,500])
  second.setCropBox(20,30,240,400)
  second.setRotation(degrees(90))
  const source = Buffer.from(await pdf.save())
  const original = {id:'scale',type:'note',page:2,text:'Verify scale — μm.',done:true,color:'#435498',point:[.95,.94]}
  const highlight = {id:'label',type:'highlight',page:1,text:'Scale',color:'#dbc982',rects:[[.1,.3,.2,.04]]}
  const data = {format:'margin-annotations',version:2,documentSha256:createHash('sha256').update(source).digest('hex'),annotations:[original,highlight]}
  async function open(name,buffer) {
    await page.locator('#file').setInputFiles({name,mimeType:'application/pdf',buffer})
    await page.locator('#filename').filter({hasText:name}).waitFor()
  }
  const card = page.locator('.card').filter({has:page.locator('.card-body[data-id="scale"]')})
  const snapshot = async()=>JSON.parse((await downloadAnnotations(page)).buffer)
  const convert = async label=>{
    await card.locator('.more').click()
    await card.getByRole('button',{name:'Convert to '+label,exact:true}).click()
    await card.getByRole('button',{name:label==='region note' ? 'Region note actions' : 'Note actions',exact:true}).waitFor()
  }
  const saved = ()=>page.locator('#save-state').getByText('Saved locally',{exact:true}).waitFor()
  async function exportPdf(subtype) {
    const [file] = await Promise.all([page.waitForEvent('download'),page.locator('#export').click()])
    const bytes = await readFile(await file.path())
    const annotations = (await PDFDocument.load(bytes)).getPage(1).node.Annots()
    assert.equal(annotations.size(),1)
    assert.equal(annotations.lookup(0).lookup(PDFName.of('Subtype')).decodeText(),subtype)
    return bytes
  }
  await open('Scale sheet.pdf',source)
  await page.locator('#page-layout').selectOption('single')
  await importAnnotations(page,{name:'source.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))},'2 added, 0 updated')
  const otherMenu = page.getByRole('button',{name:'Highlight actions',exact:true})
  await otherMenu.click()
  assert.equal(await page.getByRole('button',{name:/^Convert to /}).count(),0)
  await otherMenu.click()
  await convert('region note')
  const transfer = await downloadAnnotations(page)
  const region = {...original,updatedAt:editTime(JSON.parse(transfer.buffer).annotations[0]),type:'region',size:[96/400,64/240],point:[1-96/400,1-64/240]}
  assert.deepEqual(JSON.parse(transfer.buffer),{...data,version:12,sets:[],annotations:[region,highlight]})
  assert.equal(await page.locator('#current').textContent(),'1','Converting a card uses its own page without navigating')
  assert.ok(await card.getByRole('checkbox').isChecked())
  await page.locator('#undo').click()
  assert.deepEqual(await snapshot(),data)
  await page.locator('#redo').click()
  await saved()
  await page.reload()
  await card.getByText('Region note',{exact:true}).waitFor()
  const withRegion = await exportPdf('Square')
  await open('Scale sheet with region.pdf',withRegion)
  // Native PDF annotations are read back in page order.
  assert.deepEqual((await snapshot()).annotations,[highlight,region])
  await open('Scale sheet.pdf',source)
  await convert('point note')
  const converted = await snapshot()
  const point = {...original,point:region.point,updatedAt:editTime(converted.annotations[0])}
  assert.deepEqual(converted,{...data,version:12,sets:[],annotations:[point,highlight]})
  const withPoint = await exportPdf('Text')
  await open('Scale sheet with point.pdf',withPoint)
  assert.deepEqual((await snapshot()).annotations,[highlight,point])
  await open('Scale sheet.pdf',source)
  await importAnnotations(page,transfer,'0 added, 1 updated')
  assert.deepEqual((await snapshot()).annotations,[region,highlight])
  await saved()

  // An editor already open in another tab can still save text after conversion.
  const other = await page.context().newPage()
  try {
    await other.goto(page.url())
    await other.getByRole('button',{name:'Region note actions'}).click()
    await other.getByRole('button',{name:'Edit note',exact:true}).click()
    const revised = 'Scale confirmed — μm.'
    await other.locator('#note-text').fill(revised)
    await convert('point note')
    await other.locator('.card-body[data-id="scale"]').locator('..').getByText('Note',{exact:true}).waitFor()
    await other.locator('#note-save').click()
    await card.getByText(revised,{exact:true}).waitFor()
    const {annotations} = await snapshot()
    assert.deepEqual(annotations,[{...point,text:revised,updatedAt:editTime(annotations[0])},highlight])
  } finally { await other.close() }

  // Exercise both transaction orders before either tab has received a broadcast.
  const merged = await page.evaluate(async ({original,region})=>{
    const {writeChanges,readMarks} = await import('./src/storage.js')
    const edited = {...original,color:'#552211',text:'Updated in another tab',done:false}
    const result = []
    for (const revisions of [[edited,region],[region,edited]]) {
      const key = crypto.randomUUID()
      await writeChanges(key,[],[original])
      for (const mark of revisions) await writeChanges(key,[original],[mark])
      result.push(await readMarks(key))
      await writeChanges(key,[original],[])
      await writeChanges(key,[original],[region])
      result.push(await readMarks(key))
    }
    return result
  },{original,region})
  const combined = [{...region,color:'#552211',text:'Updated in another tab',done:false}]
  assert.deepEqual(merged,[combined,[],combined,[]])
}
