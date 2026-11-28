import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { PDFDocument } from 'pdf-lib'
import { unpack } from '../dist/src/pdf-annotations.js'

export async function checkRenameSet(page,downloadAnnotations,importAnnotations) {
  const pdf = await PDFDocument.create()
  pdf.addPage([475,625])
  const bytes = Buffer.from(await pdf.save())
  const source = {format:'margin-annotations',version:9,documentSha256:createHash('sha256').update(bytes).digest('hex'),
    sets:['Comments','Empty'],annotations:[
      {id:'n',page:1,type:'note',point:[.1,.2],color:'#326588',text:'Check units',set:'Comments'},
      {id:'h',page:1,type:'highlight',rects:[[.3,.3,.2,.03]],color:'#3377aa',text:'Units',set:'Comments'}
    ]}
  const file = data=>({name:'Sets.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))})
  const open = async (name,buffer)=>{
    await page.locator('#file').setInputFiles({name,mimeType:'application/pdf',buffer})
    await page.locator('#filename').filter({hasText:name}).waitFor()
  }
  const manage = ()=>page.locator('#manage-sets').click()
  const dialog = page.locator('#sets-dialog'), name = dialog.locator('#rename-set-name')
  const done = ()=>dialog.getByRole('button',{name:'Done',exact:true}).click()
  const edit = text=>dialog.getByRole('button',{name:'Rename '+text,exact:true}).click()
  const snapshot = async()=>JSON.parse((await downloadAnnotations(page)).buffer)
  const saved = ()=>page.locator('#save-state').getByText('Saved locally',{exact:true}).waitFor()
  async function saveName(text) {
    await name.fill(text)
    await name.press('Enter')
  }
  await open('Rename sets.pdf',bytes)
  await importAnnotations(page,file(source),'2 added, 0 updated')
  await manage()
  await edit('Empty')
  await name.fill('Canceled')
  await name.press('Escape')
  assert.ok(await dialog.isVisible())
  assert.ok(await dialog.getByRole('button',{name:'Rename Empty'}).evaluate(el=>el===document.activeElement))
  await edit('Empty')
  await saveName('References')
  await dialog.getByLabel('Write new annotations in').selectOption({label:'Comments'})
  await dialog.getByRole('checkbox',{name:'Comments',exact:true}).uncheck()
  await edit('Comments')
  await saveName('References')
  assert.ok(await name.evaluate(input=>!input.validity.valid))
  await saveName('  Decisions  ')
  assert.equal(await dialog.getByRole('checkbox',{name:'Decisions',exact:true}).isChecked(),false)
  assert.equal(await dialog.locator('#active-set option:checked').textContent(),'Decisions')
  await done()
  assert.equal(await page.locator('.card').count(),0)
  await page.locator('#undo').click()
  const undone = await snapshot()
  assert.deepEqual(undone.sets,['Comments','References'])
  assert.deepEqual(undone.annotations,source.annotations)
  await page.locator('#redo').click()
  await saved()
  await page.reload()
  await page.locator('#writing-set').filter({hasText:'Writing in Decisions'}).waitFor()
  const renamed = await snapshot()
  assert.deepEqual(renamed,{...source,sets:['Decisions','References'],annotations:source.annotations.map(mark=>({...mark,set:'Decisions'}))})
  await importAnnotations(page,file(renamed),'already in this document')
  await manage()
  await dialog.getByRole('checkbox',{name:'Decisions',exact:true}).check()
  await done()
  await saved()
  // A note started in another tab before the rename must still land in the same set.
  const other = await page.context().newPage()
  try {
    await other.goto(page.url())
    await other.locator('#filename').filter({hasText:'Rename sets.pdf'}).waitFor()
    await other.locator('button[data-tool="note"]').click()
    await other.locator('.paper.current[data-ready="true"]').click({position:{x:170,y:100}})
    await other.locator('#note-text').fill('From the second tab')
    await manage()
    await edit('Decisions')
    await saveName('Final decisions')
    await done()
    await other.locator('#writing-set').filter({hasText:'Final decisions'}).waitFor({state:'attached'})
    await other.locator('#note-save').click()
    await page.locator('.card').filter({hasText:'From the second tab'}).waitFor()
  } finally { await other.close() }
  const current = await snapshot()
  assert.equal(current.annotations.length,3)
  assert.ok(current.annotations.every(mark=>mark.set==='Final decisions'))
  const [download] = await Promise.all([page.waitForEvent('download'),page.locator('#export').click()])
  const annotated = await readFile(await download.path())
  assert.deepEqual((await unpack(annotated)).marks,current.annotations)
  await open('Renamed copy.pdf',annotated)
  assert.deepEqual((await snapshot()).sets,['Final decisions'])
  await open('Rename sets.pdf',bytes)
  await importAnnotations(page,file(source),'0 added, 2 updated')
  const older = await snapshot()
  assert.deepEqual(older.sets,['Final decisions','References','Comments','Empty'])
  assert.equal(older.annotations.find(mark=>mark.text==='From the second tab').set,'Final decisions')
  assert.equal(older.annotations.find(mark=>mark.id==='n').set,'Comments')
  await manage()
  assert.deepEqual(await dialog.locator('#visible-sets .set-count').allTextContents(),
    ['0 annotations','1 annotation','0 annotations','2 annotations','0 annotations'])
  await done()
}
