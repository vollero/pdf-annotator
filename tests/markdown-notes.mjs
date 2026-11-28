import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { PDFDocument, PDFName } from 'pdf-lib'

export async function checkMarkdownNotes(page,downloadAnnotations,importAnnotations) {
  const pdf = await PDFDocument.create()
  pdf.addPage([560,700])
  const bytes = Buffer.from(await pdf.save())
  const snippet = 'if ready:\n\tprint("<b>**literal**</b>")\n\n    finish()'
  const text = '**Review** the `id` field.\n- *Compare* values\n- Keep <b>tags</b> and ![figure](figure.png) literal.\n\n```python\n'+snippet+'\n```'
  const task = {id:'task',page:1,type:'note',text,point:[.2,.2],size:[.5,.32],color:'#356541',done:false,marginSide:'right'}
  const quote = {id:'quote',page:1,type:'comment',text:'Check **both** values.',textFormat:'markdown',color:'#4664a0',
    passages:[{page:1,quote:'Literal **PDF** text',rects:[[.1,.65,.3,.03]]}]}
  const area = {id:'plot',type:'region',page:1,point:[.2,.85],size:[.2,.05],color:'#a05632',text:'Use `kg`.',textFormat:'markdown'}
  const annotations = [task,quote,area]
  const transfer = {format:'margin-annotations',version:8,documentSha256:createHash('sha256').update(bytes).digest('hex'),annotations}
  async function open(name,buffer) {
    await page.locator('#file').setInputFiles({name,mimeType:'application/pdf',buffer})
    await page.locator('#filename').filter({hasText:name}).waitFor()
  }
  const body = page.locator('.card-body[data-id="task"]')
  const menu = async action=>{
    const card = page.locator('.card').filter({has:body})
    await card.locator('.more').click()
    await card.getByRole('button',{name:action,exact:true}).click()
  }
  const checkbox = page.getByLabel('Format as Markdown')
  const preview = page.locator('#draft-preview')
  async function checkBlock(surface) {
    const code = surface.locator('pre > code')
    assert.equal(await code.textContent(),snippet)
    assert.equal(await code.locator('*').count(),0)
    assert.deepEqual(await code.evaluate(el=>{
      const style = getComputedStyle(el)
      return [style.whiteSpace,style.tabSize,style.fontFamily.includes('monospace')]
    }),['pre-wrap','4',true])
  }
  await open('Markdown review.pdf',bytes)
  await importAnnotations(page,{name:'Review.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(transfer))},'3 added, 0 updated')
  assert.equal(await body.textContent(),text)
  assert.equal(await page.locator('.card-body[data-id="plot"] code').textContent(),'kg')
  assert.equal(await page.locator('.card-quote').textContent(),quote.passages[0].quote)
  assert.equal(await page.locator('.card-quote strong').count(),0)
  await menu('Edit note')
  assert.equal(await checkbox.isChecked(),false)
  await checkbox.check()
  await page.getByText('Preview formatting',{exact:true}).click()
  assert.equal(await preview.locator('strong').textContent(),'Review')
  assert.equal(await preview.locator('code:not(pre > code)').textContent(),'id')
  await checkBlock(preview)
  assert.equal(await preview.locator('li').count(),2)
  assert.equal(await preview.locator('b,img').count(),0)
  await page.locator('#note-text').fill('1. **First**\n2. Next')
  assert.equal(await preview.locator('ol li').count(),2)
  await page.locator('#note-dialog').getByRole('button',{name:'Cancel'}).click()
  assert.equal(await body.textContent(),text)
  await menu('Edit note')
  await checkbox.check()
  await page.locator('#note-save').click()
  for (const surface of [body,page.locator('.paper.current .page-note-text'),page.locator('.margin-note[data-id="task"]')]) {
    await surface.locator('strong').waitFor({state:'attached'})
    assert.equal(await surface.locator('em').textContent(),'Compare')
    assert.equal(await surface.locator('b,img,a').count(),0)
    await checkBlock(surface)
  }
  await page.locator('#undo').click()
  assert.equal(await body.textContent(),text)
  await page.locator('#redo').click()
  await menu('Pin preview')
  assert.equal(await page.locator('#preview-text strong').textContent(),'Review')
  await checkBlock(page.locator('#preview-text'))
  await page.locator('#preview-pin').click()
  await page.locator('#save-state').getByText('Saved locally',{exact:true}).waitFor()
  await page.reload()
  await body.locator('strong').waitFor()
  await menu('Edit note')
  assert.equal(await checkbox.isChecked(),true)
  assert.equal(await page.locator('#note-text').inputValue(),text)
  await page.keyboard.press('Escape')
  const exported = JSON.parse((await downloadAnnotations(page)).buffer)
  assert.deepEqual(exported,{...transfer,annotations:[{...task,textFormat:'markdown'},quote,area]})
  await menu('Edit note')
  await page.locator('#note-text').fill('Short replacement')
  await page.locator('#note-save').click()
  await importAnnotations(page,{name:'Markdown.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(exported))},'0 added, 1 updated')
  await checkBlock(body)
  const [download] = await Promise.all([page.waitForEvent('download'),page.locator('#export').click()])
  const annotated = await readFile(await download.path())
  const native = (await PDFDocument.load(annotated)).getPage(0).node.Annots().lookup(0)
  assert.equal(native.lookup(PDFName.of('Contents')).decodeText(),'To do: Review the id field.\n• Compare values\n• Keep <b>tags</b> and ![figure](figure.png) literal.\n\n'+snippet)
  // Compare glyph positions in the same canvas mask used by expanded PDF notes.
  const tabStops = await page.evaluate(async()=>{
    const {noteTextMask} = await import('./src/note-text-mask.js')
    const {noteTextRuns} = await import('./src/note-format.js')
    const mask = line => noteTextMask(noteTextRuns({text:'~~~\n'+line+'\n~~~',textFormat:'markdown'}),220,80,
      {fontSize:16,fontFamily:'sans-serif'}).bytes
    const tabs = mask('\tA\tB')
    const samePixels = other => tabs.every((byte,i)=>byte===other[i])
    return [samePixels(mask('    A   B')),samePixels(mask('A B'))]
  })
  assert.deepEqual(tabStops,[true,false])
  await open('Markdown review annotated.pdf',annotated)
  await body.locator('strong').waitFor()
  await checkBlock(body)
  await menu('Edit note')
  assert.equal(await page.locator('#note-text').inputValue(),text)
  await checkbox.uncheck()
  await page.locator('#note-save').click()
  assert.equal(await body.textContent(),text)
}
