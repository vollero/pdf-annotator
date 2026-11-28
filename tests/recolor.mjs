import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { PDFDocument, PDFName } from 'pdf-lib'

export async function checkRecolor(page, downloadAnnotations, importAnnotations) {
  const pdf = await PDFDocument.create()
  for (const words of ['Check the first figure.','Compare the second figure.']) {
    pdf.addPage([460,260]).drawText(words,{x:36,y:200,size:16})
  }
  const bytes = Buffer.from(await pdf.save())
  const original = '#12ABCD'
  const rects = [[.08,.17,.36,.08]]
  const marks = [
    {id:'highlight',type:'highlight',text:'Check the first figure.',rects},
    {id:'ink',type:'draw',text:'Freehand drawing',points:[[.4,.5],[.6,.7]]},
    {id:'note',type:'note',text:'Check the total.',point:[.3,.6],done:false},
    {id:'review',type:'comment',style:'dashed-underline',text:'Figures reviewed.',done:true,
      passages:[1,2].map(page=>({page,rects,quote:'Figure '+page}))}
  ].map(mark=>({...mark,page:1,color:original}))
  const source = {format:'margin-annotations',version:4,documentSha256:createHash('sha256').update(bytes).digest('hex'),annotations:marks}
  const file = {name:'Review.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(source))}
  const open = async (name,buffer) => {
    await page.locator('#file').setInputFiles({name,mimeType:'application/pdf',buffer})
    await page.locator('#filename').filter({hasText:name}).waitFor()
    await page.locator('.paper.current[data-ready="true"]').waitFor()
  }
  await open('Review.pdf',bytes)
  await importAnnotations(page,file,'4 added, 0 updated')
  await page.locator('#save-state').getByText('Saved locally',{exact:true}).waitFor()
  await page.reload()
  const card = (tab,id) => tab.locator('.card').filter({has:tab.locator('.card-body[data-id="'+id+'"]')})
  const edit = async id => {
    const item = card(page,id)
    await item.locator('.more').click()
    await item.getByRole('button',{name:'Change color'}).click()
  }
  const dialog = page.getByRole('dialog',{name:'Change annotation color'})
  const hex = dialog.getByLabel('Hex color'), saved = dialog.getByLabel('Saved colors')
  const apply = () => dialog.getByRole('button',{name:'Apply color'}).click()
  const undo = page.getByRole('button',{name:'Undo',exact:true})
  const snapshot = async () => JSON.parse((await downloadAnnotations(page)).buffer)
  await edit('highlight')
  assert.equal(await hex.inputValue(),original.toLowerCase())
  assert.equal(await saved.inputValue(),'')
  await apply()
  assert.ok(await undo.isDisabled())
  await edit('highlight')
  await hex.fill('red')
  await apply()
  assert.ok(await hex.evaluate(el=>!el.validity.valid))
  await dialog.getByRole('button',{name:'Cancel'}).click()
  await edit('highlight')
  await saved.selectOption('#91b9dd')
  await page.keyboard.press('Escape')
  await dialog.waitFor({state:'hidden'})
  assert.ok(await undo.isDisabled())
  assert.deepEqual(await snapshot(),source)

  const nextColors = ['#9abd9e','#774455','#345678','#cc5522']
  const expected = marks.map((mark,i)=>({...mark,color:nextColors[i]}))
  for (const [i,mark] of marks.entries()) {
    await edit(mark.id)
    if (i===0) await saved.selectOption(nextColors[i])
    else if (i===1) await dialog.getByLabel('Choose a color').fill(nextColors[i])
    else await hex.fill(nextColors[i].slice(1).toUpperCase())
    await apply()
    await page.waitForFunction(({id,color})=>{
      const card = document.activeElement.closest('.card')
      return document.activeElement.matches('.more') && card.querySelector('.card-body').dataset.id===id &&
        card.style.getPropertyValue('--tone')===color
    },{id:mark.id,color:nextColors[i]})
  }
  await undo.click()
  assert.equal((await snapshot()).annotations.at(-1).color,original)
  await page.getByRole('button',{name:'Redo',exact:true}).click()
  assert.equal(await page.getByRole('button',{name:'Amber annotation color'}).getAttribute('aria-pressed'),'true')
  await page.locator('#page-layout').selectOption('continuous')
  for (const num of [1,2]) {
    const paper = page.locator('.paper[data-page="'+num+'"][data-ready="true"]')
    await paper.locator('[data-id="review"] [data-markup][stroke="#cc5522"]').waitFor({state:'attached'})
    assert.equal(await paper.locator('.note-marker[data-id="review"] path').first().getAttribute('fill'),'#cc5522')
  }

  // Apply a color while another editor saves new wording to the same tracked note.
  const other = await page.context().newPage()
  try {
    await other.goto(page.url())
    await card(other,'note').locator('.more').click()
    await other.getByRole('button',{name:'Edit note'}).click()
    expected[2].text = 'Total verified.'
    expected[2].color = '#138872'
    await other.locator('#note-text').fill(expected[2].text)
    await edit('note')
    await hex.fill(expected[2].color)
    await Promise.all([apply(),other.locator('#note-save').click()])
    for (const tab of [page,other]) await tab.waitForFunction(() => {
      const card = document.querySelector('[data-id="note"].card-body')?.closest('.card')
      return card?.textContent.includes('Total verified.') && card.style.getPropertyValue('--tone')==='#138872'
    })
  } finally { await other.close() }
  await page.reload()
  await card(page,'review').waitFor()
  const migration = await downloadAnnotations(page)
  assert.deepEqual(JSON.parse(migration.buffer),{...source,annotations:expected})
  await importAnnotations(page,file,'0 added, 4 updated')
  await importAnnotations(page,migration,'0 added, 4 updated')
  const [download] = await Promise.all([page.waitForEvent('download'),page.locator('#export').click()])
  const exported = await readFile(await download.path())
  const result = await PDFDocument.load(exported)
  for (const [index,sheet] of result.getPages().entries()) {
    const annotations = sheet.node.Annots(), pageMarks = index===0 ? expected : [expected[3]]
    assert.equal(annotations.size(),pageMarks.length)
    for (let i=0;i<annotations.size();i++) {
      const color = annotations.lookup(i).lookup(PDFName.of('C')).asArray()
      const hex = color.map(n=>Math.round(255*n.asNumber()).toString(16).padStart(2,'0')).join('')
      assert.equal('#'+hex,pageMarks[i].color)
    }
  }
  await open('Reviewed colors.pdf',exported)
  assert.deepEqual((await snapshot()).annotations,expected)
  await page.locator('#page-layout').selectOption('single')
}
