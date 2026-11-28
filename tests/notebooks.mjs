import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {PDFDocument} from 'pdf-lib'
export async function checkNotebooks(page) {
  const pdf=await PDFDocument.create();pdf.addPage([420,620])
  await page.locator('#file').setInputFiles({name:'Notebook pilot.pdf',mimeType:'application/pdf',buffer:Buffer.from(await pdf.save())})
  await page.locator('#filename').filter({hasText:'Notebook pilot.pdf'}).waitFor()
  await page.locator('button[data-tool="note"]').click()
  await page.locator('.paper.current[data-ready="true"]').click({position:{x:110,y:95}})
  await page.locator('#note-text').fill('Mathematical derivation')
  await page.locator('#write-book').click()
  const sheet=page.locator('#book-sheet'), status=page.locator('#book-status')
  await sheet.waitFor()
  const rect=await sheet.boundingBox()
  const x=rect.x+35,y=rect.y+35
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+45,y+8,{steps:8});await page.mouse.up()
  await status.filter({hasText:'Page saved'}).waitFor()
  assert.equal(await sheet.locator('path').count(),1)
  await page.locator('#book-page-action').selectOption('duplicate')
  await page.locator('#book-position').filter({hasText:'2 / 2'}).waitFor()
  await page.locator('#book-dialog summary').filter({hasText:'Export notebooks'}).click()
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#book-print').click()])
  const print=await PDFDocument.load(await readFile(await download.path()))
  assert.equal(print.getPageCount(),2)
  await page.locator('#book-close').click()
  const [pack]=await Promise.all([page.waitForEvent('download'),page.locator('#export-annotations').click()])
  assert.ok(pack.suggestedFilename().endsWith('.marginbook'))
  await page.reload();await page.getByRole('button',{name:'Open notebook · 2 pages'}).click()
  assert.equal(await page.locator('#book-index').inputValue(),'2')
  assert.equal(await sheet.locator('path').count(),1)
  await page.locator('#book-close').click()
}
