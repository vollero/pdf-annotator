import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { PDFDocument, PDFName } from 'pdf-lib'

export async function checkNoteLinks(page,downloadAnnotations,importAnnotations) {
  const url = 'https://notes.example.test/units?scale=mm#table'
  const text = 'Check [**units table**]('+url+').'
  const pdf = await PDFDocument.create()
  pdf.addPage([500,700])
  const bytes = Buffer.from(await pdf.save())
  const mark = {id:'units',type:'note',page:1,point:[.1,.2],size:[.65,.3],marginSide:'right',color:'#325677',text,textFormat:'markdown'}
  const transfer = {format:'margin-annotations',version:8,documentSha256:createHash('sha256').update(bytes).digest('hex'),annotations:[mark]}
  const context = page.context()
  const requests = []
  const pattern = 'https://notes.example.test/**'
  const destination = async route=>{
    if (new URL(route.request().url()).pathname !== '/units') {
      await route.fulfill({status:204})
      return
    }
    requests.push(await route.request().allHeaders())
    await route.fulfill({contentType:'text/html',body:'<title>Units table</title>'})
  }
  await context.route(pattern,destination)
  const open = async(name,buffer)=>{
    await page.locator('#file').setInputFiles({name,mimeType:'application/pdf',buffer})
    await page.locator('#filename').filter({hasText:name}).waitFor()
  }
  const follow = async(surface,keyboard=false)=>{
    const link = surface.getByRole('link',{name:'units table'})
    assert.equal(await link.getAttribute('href'),url)
    assert.equal(await link.evaluate(el=>!!el.closest('button,[role="button"]')),false)
    const [tab] = await Promise.all([
      context.waitForEvent('page'),
      keyboard ? link.press('Enter') : link.locator('strong').click()
    ])
    try {
      await tab.waitForURL(url)
      assert.deepEqual(await tab.evaluate(()=>[window.opener === null,document.referrer]),[true,''])
    } finally { await tab.close() }
    assert.equal(requests.at(-1)?.referer,undefined)
  }
  try {
    await open('Units.pdf',bytes)
    await importAnnotations(page,{name:'Units.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(transfer))},'1 added, 0 updated')
    const sidebar = page.locator('.card-body[data-id="units"]')
    const margin = page.locator('.margin-note[data-id="units"]')
    const paper = page.locator('.paper.current .page-note-text')
    await paper.getByRole('link').waitFor()
    assert.equal(requests.length,0)
    await follow(sidebar,true)
    assert.equal(await page.locator('.card.selected').count(),0)
    await sidebar.getByRole('button',{name:'Show on page 1'}).press('Enter')
    await page.locator('.card.selected').waitFor()
    await page.locator('button[data-tool="select"]').click()
    await follow(paper)
    await follow(margin)
    assert.equal(await page.locator('#note-dialog').isVisible(),false)
    await page.locator('.card .more').click()
    await page.locator('.card-menu').getByRole('button',{name:'Pin preview'}).click()
    await follow(page.locator('#preview-text'))
    await page.locator('#preview-pin').click()
    await margin.getByRole('button',{name:'Edit margin note'}).press('Enter')
    assert.equal(await page.locator('#note-text').inputValue(),text)
    await page.getByText('Preview formatting',{exact:true}).click()
    const preview = page.locator('#draft-preview')
    await follow(preview)
    assert.equal(requests.length,5)
    const literal = '[local](file:///example.pdf) [relative](guide) [app](about:blank) `<https://notes.example.test/>`'
    await page.locator('#note-text').fill(literal)
    assert.equal(await preview.locator('a').count(),0)
    assert.ok((await preview.textContent()).includes('[app](about:blank)'))
    await page.locator('#note-dialog').getByRole('button',{name:'Cancel'}).click()
    await page.waitForFunction(()=>document.activeElement.matches('.margin-note .note-action'))
    assert.deepEqual(JSON.parse((await downloadAnnotations(page)).buffer),transfer)
    const [download] = await Promise.all([page.waitForEvent('download'),page.locator('#export').click()])
    const annotated = await readFile(await download.path())
    const native = (await PDFDocument.load(annotated)).getPage(0).node.Annots().lookup(0)
    assert.equal(native.lookup(PDFName.of('Contents')).decodeText(),'Check units table ('+url+').')
    await open('Units annotated.pdf',annotated)
    assert.equal(await sidebar.getByRole('link').getAttribute('href'),url)
    await margin.getByRole('button').press('Enter')
    assert.equal(await page.locator('#note-text').inputValue(),text)
    await page.getByLabel('Format as Markdown').uncheck()
    await page.locator('#note-save').click()
    assert.equal(await sidebar.textContent(),text)
    assert.equal(await sidebar.locator('a').count(),0)
  } finally { await context.unroute(pattern,destination) }
}
