import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { PDFDocument, PDFName } from 'pdf-lib'

export async function checkMathNotes(page,downloadAnnotations,importAnnotations) {
  const pdf = await PDFDocument.create()
  pdf.addPage([500,700])
  const bytes = Buffer.from(await pdf.save())
  const text = 'Inline $r^2$.\n$$\nA=\\frac{\\pi d^2}{4}\n$$\nPrice $5 or $10. Code: `$a$`.\n~~~\n$b$\n~~~'
  const note = {id:'area',page:1,type:'note',point:[.1,.15],size:[.7,.45],marginSide:'left',color:'#336499',text,textFormat:'markdown'}
  const transfer = {format:'margin-annotations',version:8,documentSha256:createHash('sha256').update(bytes).digest('hex'),annotations:[note]}
  async function open(name,buffer) {
    await page.locator('#file').setInputFiles({name,mimeType:'application/pdf',buffer})
    await page.locator('#filename').filter({hasText:name}).waitFor()
  }
  async function checkMath(surface) {
    await surface.locator('math:not([display="block"]) msup').waitFor({state:'attached'})
    await surface.locator('math[display="block"] mfrac').waitFor({state:'attached'})
    assert.equal(await surface.locator('math').count(),2)
    assert.equal(await surface.locator('math annotation').first().textContent(),'r^2')
    assert.equal(await surface.locator('pre code').textContent(),'$b$')
    assert.match(await surface.textContent(),/Price \$5 or \$10/)
  }
  await open('Circle.pdf',bytes)
  await importAnnotations(page,{name:'area.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(transfer))},'1 added, 0 updated')
  const card = page.locator('.card-body[data-id="area"]')
  const margin = page.locator('.margin-note[data-id="area"]')
  await checkMath(card)
  await page.locator('.paper.current .page-note-text math').first().waitFor()
  await checkMath(page.locator('.paper.current .page-note-text'))
  await checkMath(margin)
  for (const button of [card,margin]) assert.ok((await button.getAttribute('aria-label')).includes('$r^2$'))
  await page.locator('.card .more').click()
  await page.locator('.card-menu').getByRole('button',{name:'Pin preview',exact:true}).click()
  await checkMath(page.locator('#preview-text'))
  await page.locator('#preview-pin').click()
  await margin.click()
  assert.equal(await page.locator('#note-text').inputValue(),text)
  await page.getByText('Preview formatting',{exact:true}).click()
  const preview = page.locator('#draft-preview')
  await checkMath(preview)
  const invalid = '$\\unknownCommand{x}$'
  await page.locator('#note-text').fill(invalid)
  assert.equal(await preview.textContent(),invalid)
  await page.locator('#note-text').fill('Use $\\href{https://example.org}{link}$ here.')
  assert.equal(await preview.locator('a,[href],img').count(),0)
  await page.locator('#note-text').fill('\\$x\\$ and $y$')
  assert.equal(await preview.locator('math').count(),1)
  assert.match(await preview.textContent(),/^\$x\$ and /)
  await page.locator('#note-dialog').getByRole('button',{name:'Cancel'}).click()
  assert.deepEqual(JSON.parse((await downloadAnnotations(page)).buffer),transfer)
  const [download] = await Promise.all([page.waitForEvent('download'),page.locator('#export').click()])
  const annotated = await readFile(await download.path())
  const native = (await PDFDocument.load(annotated)).getPage(0).node.Annots().lookup(0)
  assert.match(native.lookup(PDFName.of('Contents')).decodeText(),/A=\\frac\{\\pi d\^2\}\{4\}/)
  await open('Circle annotated.pdf',annotated)
  await checkMath(card)
  await margin.click()
  assert.equal(await page.locator('#note-text').inputValue(),text)
  await page.getByLabel('Format as Markdown').uncheck()
  await page.locator('#note-save').click()
  assert.equal(await card.textContent(),text)
  assert.equal(await card.locator('math').count(),0)
}
