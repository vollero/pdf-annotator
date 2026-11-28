import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PDFDocument } from 'pdf-lib'

export async function checkTextMarkup(page, downloadAnnotations, importAnnotations) {
  const doc = await PDFDocument.create()
  const sheet = doc.addPage([520,280])
  const first = 'Verify the units in Figure 2.'
  const second = 'Replace the previous estimate.'
  sheet.drawText(first,{x:35,y:220,size:16})
  sheet.drawText(second,{x:35,y:165,size:16})
  const open = async (name,buffer) => {
    await page.locator('#file').setInputFiles({name,mimeType:'application/pdf',buffer})
    await page.locator('#filename').filter({hasText:name}).waitFor()
    await page.locator('.paper.current[data-ready="true"]').waitFor()
  }
  await open('Text markup.pdf',Buffer.from(await doc.save()))
  const paper = page.locator('.paper.current')
  const run = text => paper.locator('.textLayer span').filter({hasText:text}).first()
  const path = (style,element='polyline') => paper.locator('[data-markup="'+style+'"] '+element).first()
  const select = async text => {
    await run(text).evaluate(el=>{
      const node = el.firstChild
      window.getSelection().setBaseAndExtent(node,0,node,node.length)
    })
  }
  await page.getByRole('combobox',{name:'Text markup style',exact:true}).selectOption('underline')
  const box = await run(first).boundingBox()
  await page.mouse.move(box.x+1,box.y+box.height/2)
  await page.mouse.down()
  await page.mouse.move(box.x+box.width-1,box.y+box.height/2,{steps:8})
  await page.mouse.up()
  await path('underline').waitFor({state:'attached'})
  const card = page.locator('.card').filter({hasText:'Verify the units'})
  assert.equal(await card.locator('.card-title').textContent(),'Solid underline')
  const measure = () => path('underline').evaluate(el=>{
    const span = el.closest('.paper').querySelector('.textLayer span').getBoundingClientRect()
    const line = el.getBoundingClientRect()
    return {width:line.width, relativeWidth:line.width/span.width, bottom:(line.bottom-span.bottom)/span.height}
  })
  const before = await measure()
  await page.locator('#zoom-in').click()
  await paper.locator('.ink [data-markup="underline"]').waitFor({state:'attached'})
  const after = await measure()
  assert.ok(after.width > before.width*1.1)
  assert.ok(Math.abs(after.relativeWidth-1)<.08 && Math.abs(after.bottom)<.15,'Underline follows the selected line at a new zoom')

  const setStyle = async (entry,style) => {
    await entry.locator('.more').click()
    await entry.getByRole('combobox',{name:'Markup style'}).selectOption(style)
  }
  await setStyle(card,'dashed-underline')
  assert.ok(await path('dashed-underline').getAttribute('stroke-dasharray'))
  await page.getByRole('button',{name:'Undo',exact:true}).click()
  assert.equal(await card.locator('.card-title').textContent(),'Solid underline')
  await page.getByRole('button',{name:'Redo',exact:true}).click()
  assert.equal(await card.locator('.card-title').textContent(),'Dashed underline')

  await page.locator('.tool[data-tool="select"]').click()
  await select(second)
  const actions = page.getByRole('group',{name:'Selected passage'})
  const picker = actions.getByRole('combobox',{name:'Selection markup style'})
  await picker.selectOption('strikethrough')
  await actions.getByRole('button',{name:'Strikethrough',exact:true}).click()
  await path('strikethrough').waitFor({state:'attached'})
  await select(second)
  await picker.selectOption('dotted-underline')
  await actions.getByRole('button',{name:'Comment',exact:true}).click()
  const editor = page.getByRole('dialog',{name:'Comment on passage'})
  assert.equal(await editor.locator('blockquote').textContent(),second)
  await editor.getByRole('textbox',{name:'Comment',exact:true}).fill('Use the revised estimate.')
  await editor.getByLabel('Track as action').check()
  await editor.getByRole('button',{name:'Save comment'}).click()
  assert.equal(await path('dotted-underline').getAttribute('stroke-linecap'),'round')
  const comment = page.locator('.card').filter({hasText:'Use the revised estimate.'})
  await setStyle(comment,'outline-box')
  await path('outline-box','polygon').waitFor({state:'attached'})
  await page.locator('#save-state').getByText('Saved locally',{exact:true}).waitFor()
  await page.reload()
  await comment.waitFor()
  const file = await downloadAnnotations(page)
  const data = JSON.parse(file.buffer)
  assert.equal(data.version,4)
  assert.deepEqual(data.annotations.map(a=>a.style),['dashed-underline','strikethrough','outline-box'])
  const last = data.annotations.at(-1)
  assert.equal(last.passages[0].quote,second)
  assert.equal(last.done,false)
  await comment.locator('.more').click()
  await comment.getByRole('button',{name:'Delete'}).click()
  await importAnnotations(page,file,'1 added, 0 updated')
  const [download] = await Promise.all([page.waitForEvent('download'),page.locator('#export').click()])
  await open('Reviewed markup.pdf',await readFile(await download.path()))
  assert.deepEqual(JSON.parse((await downloadAnnotations(page)).buffer).annotations,data.annotations)
}
