import { editTime } from './dated-edit.mjs'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { PDFDocument } from 'pdf-lib'

export async function checkMarginNotes(page, downloadAnnotations, importAnnotations) {
  const pdf = await PDFDocument.create()
  for (const size of [[500,700],[400,600]]) pdf.addPage(size)
  const bytes = Buffer.from(await pdf.save())
  const color = '#37744b'
  const point = {id:'point',type:'note',text:'Verify the date.',page:1,color,point:[.2,.3],done:false}
  const region = {id:'region',type:'region',text:'Label the diagram.',page:1,color,point:[.4,.3],size:[.1,.2],marginSide:'left'}
  const comment = {id:'comment',type:'comment',text:'Check both totals.',page:1,color,marginSide:'right',
    passages:[1,2].map(page=>({page,quote:'Total',rects:[[.1,.5,.25,.03]]}))}
  const data = {format:'margin-annotations',version:7,documentSha256:createHash('sha256').update(bytes).digest('hex'),annotations:[point,region,comment]}
  const open = async (name, buffer) => {
    await page.locator('#file').setInputFiles({name,mimeType:'application/pdf',buffer})
    await page.locator('#filename').filter({hasText:name}).waitFor()
  }
  const paper = number => page.locator('.paper[data-page="'+number+'"]')
  const rail = (side,number=1) => page.getByRole('group',{name:side+' margin on page '+number,exact:true})
  const button = (side,label,number=1) => rail(side,number).getByRole('button',{name:label})
  const saveSide = async side => {
    await page.getByLabel('Margin placement').selectOption(side)
    await page.locator('#note-save').click()
  }
  const aligned = async number => {
    await page.waitForFunction(number=>{
      const row = document.querySelector('.page-row[data-page="'+number+'"]')
      const note = row.querySelector('.margin-rail.right .margin-note')
      if (!note) return false
      const p = row.querySelector('.paper').getBoundingClientRect(), n = note.getBoundingClientRect()
      return n.left >= p.right && Math.abs(n.top - p.top - p.height * .5) < 2
    },number)
  }
  await open('Margin placement.pdf',bytes)
  await importAnnotations(page,{name:'Margin placement.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))},'3 added, 0 updated')
  await aligned(1)
  await paper(1).getByRole('button',{name:'Edit note on page 1 (To do)',exact:true}).click()
  assert.equal(await page.getByLabel('Margin placement').inputValue(),'')
  await saveSide('left')
  const task = button('Left','To do · '+point.text)
  const figure = button('Left',region.text)
  await page.waitForFunction(() => {
    const row = document.querySelector('.page-row[data-page="1"]')
    const notes = row.querySelectorAll('.margin-rail.left button')
    if (notes.length !== 2) return false
    const [first,second] = [...notes].map(el=>el.getBoundingClientRect())
    return first.right <= row.querySelector('.paper').getBoundingClientRect().left && second.top >= first.bottom
  })
  assert.ok(await figure.isVisible())
  await page.locator('#zoom-in').click()
  await aligned(1)
  await page.locator('#page-layout').selectOption('continuous')
  await page.locator('#next').click()
  await aligned(2)
  await page.locator('#workspace-toggle').click()
  await button('Right',comment.text,2).click()
  assert.equal(await page.locator('#passage-quote').textContent(),'Total\nTotal')
  await saveSide('left')
  await button('Left',comment.text,2).waitFor()
  await page.waitForFunction(id=>document.activeElement.matches('.margin-note') && document.activeElement.dataset.id===id,comment.id)
  assert.equal(await rail('Right',2).count(),0)
  await page.locator('#workspace-toggle').click()
  await page.locator('#undo').click()
  await aligned(2)
  await page.locator('#prev').click()
  await task.click()
  await saveSide('')
  assert.equal(await task.count(),0)
  await page.locator('#undo').click()
  await task.waitFor()
  await page.locator('#save-state').getByText('Saved locally',{exact:true}).waitFor()
  await page.reload()
  await task.waitFor()
  const exported = JSON.parse((await downloadAnnotations(page)).buffer)
  assert.deepEqual(exported,{...data,version:12,sets:[],annotations:[{...point,marginSide:'left',updatedAt:editTime(exported.annotations[0])},region,comment]})
  await page.locator('#workspace-toggle').click()
  await page.setViewportSize({width:400,height:650})
  await page.locator('#fit').click()
  await aligned(1)
  assert.ok(await page.locator('#scroller').evaluate(el=>el.scrollWidth>el.clientWidth))
  await button('Right',comment.text).click()
  assert.equal(await page.getByLabel('Margin placement').inputValue(),'right')
  await page.keyboard.press('Escape')
  await page.setViewportSize({width:1360,height:920})
  await page.locator('#workspace-toggle').click()
  const [download] = await Promise.all([page.waitForEvent('download'),page.locator('#export').click()])
  const annotated = await readFile(await download.path())
  assert.deepEqual((await PDFDocument.load(annotated)).getPages().map(page=>page.getSize()),pdf.getPages().map(page=>page.getSize()))
  await open('Margin placement annotated.pdf',annotated)
  await task.waitFor()
  await aligned(1)
  await page.locator('#page-layout').selectOption('single')
  const crowded = Array.from({length:30},(_,i)=>({...point,id:'extra-'+i,page:2,point:[.25,.95],marginSide:'left',text:'Review item '+(i+1)}))
  const transfer = {...data,documentSha256:createHash('sha256').update(annotated).digest('hex'),annotations:crowded}
  await importAnnotations(page,{name:'More notes.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(transfer))},'30 added, 0 updated')
  await page.locator('#next').click()
  await button('Left','To do · Review item 30',2).click()
  assert.equal(await page.locator('#note-text').inputValue(),'Review item 30')
  await page.keyboard.press('Escape')
  assert.ok(await rail('Left',2).evaluate(el=>el.scrollTop>0),'The final card in a crowded margin can be reached')
}
