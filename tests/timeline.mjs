import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { PDFDocument,PDFName } from 'pdf-lib'
import { readFile } from 'node:fs/promises'

export async function checkTimeline(page,downloadAnnotations,importAnnotations) {
  const pdf=await PDFDocument.create()
  pdf.addPage([431,605])
  pdf.addPage([430,605])
  const buffer=Buffer.from(await pdf.save()), name='Timeline.pdf'
  const hash=createHash('sha256').update(buffer).digest('hex')
  const at='2023-06-03T12:30:00.033Z', later='2024-02-04T12:30:00.000Z'
  const note={id:'dated',type:'note',page:2,point:[.35,.25],color:'#aa88cc',text:'First wording',createdAt:at,updatedAt:later}
  const old={id:'old',type:'highlight',page:1,rects:[[.1,.1,.2,.1]],color:'#aacc88',text:'Undated'}
  const data={format:'margin-annotations',version:12,sets:[],documentSha256:hash,annotations:[note,old]}
  const file={name,mimeType:'application/pdf',buffer}
  const current=async()=>JSON.parse((await downloadAnnotations(page)).buffer)
  await page.locator('#file').setInputFiles(file)
  await page.locator('#filename').filter({hasText:name}).waitFor()
  await importAnnotations(page,{name:'dates.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))},'2 added')
  const card=page.locator('.card').filter({has:page.locator('[data-id="dated"].card-body')})
  assert.deepEqual(await card.locator('time').evaluateAll(times=>times.map(t=>t.dateTime)),[at,later])
  const dialog=page.locator('#timeline-dialog'), mode=page.locator('#timeline-mode')
  const open=()=>page.locator('#open-timeline').click()
  const exit=async()=>{await dialog.getByRole('button',{name:'Return to current draft'}).click(); await dialog.waitFor({state:'hidden'})}
  const text=page.locator('#timeline-text'), description=page.locator('#timeline-description')
  await open()
  await description.filter({hasText:'Last edited'}).waitFor()
  await page.locator('#timeline-earlier').click()
  await description.filter({hasText:'Created'}).waitFor()
  assert.equal(await page.locator('#current').textContent(),'2')
  await page.locator('#timeline-day').fill('2020-01-01')
  await description.filter({hasText:'No entry'}).waitFor()
  await mode.selectOption('drafts')
  await page.locator('#timeline-record').check()
  await description.filter({hasText:'2 visible of 2'}).waitFor()
  await exit()
  assert.deepEqual(await current(),data)
  const edit=async()=>{
    await card.locator('.more').click()
    await card.getByRole('button',{name:'Edit note',exact:true}).click()
  }
  await edit()
  await page.locator('#note-text').fill('Revised wording')
  await page.locator('#note-save').click()
  const revised=await current()
  assert.equal(revised.annotations[0].createdAt,at)
  assert.ok(revised.annotations[0].updatedAt>later)
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#export').click()])
  const bytes=await readFile(await download.path())
  const native=(await PDFDocument.load(bytes)).getPage(1).node.Annots().lookup(0)
  assert.equal(native.lookup(PDFName.of('CreationDate')).decodeDate().toISOString(),at.replace('.033','.000'))
  assert.equal(native.lookup(PDFName.of('M')).decodeDate().toISOString(),revised.annotations[0].updatedAt.replace(/\.\d{3}Z$/,'.000Z'))
  await card.locator('.more').click()
  await card.getByRole('button',{name:'Delete',exact:true}).click()
  await page.locator('#save-state').filter({hasText:'Saved locally'}).waitFor()
  await page.reload()
  await page.locator('#filename').filter({hasText:name}).waitFor()
  await open()
  await mode.selectOption('drafts')
  await description.filter({hasText:'1 visible of 1'}).waitFor()
  await page.locator('#timeline-earlier').click()
  await text.filter({hasText:'Revised wording'}).waitFor()
  await page.locator('#timeline-earlier').click()
  await text.filter({hasText:'First wording'}).waitFor()
  await dialog.getByRole('button',{name:'Later',exact:true}).click()
  await text.filter({hasText:'Revised wording'}).waitFor()
  await page.locator('#timeline-record').uncheck()
  await page.locator('#timeline-record:enabled').waitFor()
  await exit()
  assert.deepEqual((await current()).annotations,[old])
  await open()
  await mode.selectOption('drafts')
  page.once('dialog',prompt=>prompt.accept())
  await page.locator('#timeline-clear').click()
  await description.filter({hasText:'No drafts recorded'}).waitFor()
  await exit()
}
