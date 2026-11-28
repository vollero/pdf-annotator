import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { PDFDocument } from 'pdf-lib'

export async function checkDiscussion(page,downloadAnnotations,importAnnotations) {
  const pdf = await PDFDocument.create()
  pdf.addPage([501,713])
  const buffer = Buffer.from(await pdf.save()), name='Discussion.pdf'
  const hash = createHash('sha256').update(buffer).digest('hex')
  const snapshot = async()=>JSON.parse((await downloadAnnotations(page)).buffer)
  const note = {id:'review',type:'note',page:1,point:[.3,.2],text:'Original',author:'Lea',color:'#aaddcc'}
  const file = {format:'margin-annotations',version:10,sets:[],documentSha256:hash,annotations:[note]}
  await page.locator('#file').setInputFiles({name,mimeType:'application/pdf',buffer})
  await page.locator('#filename').filter({hasText:name}).waitFor()
  await importAnnotations(page,{name:'Review.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(file))},'1 added, 0 updated')
  const edit = async()=>{
    await page.locator('.card .more').click()
    await page.getByRole('button',{name:'Edit note',exact:true}).click()
    await page.locator('#discussion > summary').click()
  }
  const save = async()=>{
    await page.locator('#note-save').click()
    await page.locator('#note-dialog').waitFor({state:'hidden'})
    await page.locator('#save-state').filter({hasText:'Saved locally'}).waitFor()
  }
  await edit()
  await page.locator('#track-history').check()
  await page.locator('#contributor').fill('Jon')
  await page.locator('#note-text').fill('Edited by Jon')
  await page.locator('#reply-text').fill('Please verify the source.')
  await save()
  await page.locator('.card').getByRole('button',{name:'1 reply'}).click()
  await page.getByRole('button',{name:'Reply to #1',exact:true}).click()
  await page.locator('#contributor').fill('Lea')
  await page.locator('#reply-text').fill('The source checks out.')
  await save()
  const second = await snapshot()
  assert.equal(second.version,11)
  assert.equal(second.annotations[0].replies[1].parent,second.annotations[0].replies[0].id)
  await edit()
  await page.getByRole('button',{name:'Reply to #2',exact:true}).click()
  await page.locator('#reply-text').fill('Thanks!')
  await page.locator('#contributor').fill('Mia')
  await page.locator('#versions > summary').click()
  await page.getByRole('button',{name:'Use version 1'}).click()
  await save()
  const final = await snapshot(), mark = final.annotations[0]
  assert.equal(mark.text,'Original')
  assert.equal(mark.author,'Lea')
  assert.deepEqual(mark.history.versions.map(v=>[v.text,v.author]),[['Original','Jon'],['Edited by Jon','Jon'],['Original','Mia']])
  assert.equal(mark.replies[2].parent,mark.replies[1].id)
  await page.reload()
  await page.locator('#filename').filter({hasText:name}).waitFor()
  assert.deepEqual(await snapshot(),final)
  await page.locator('#restore-draft').click()
  await page.locator('#recovery-dialog').getByRole('button',{name:'Cancel'}).click()
  assert.deepEqual(await snapshot(),final)
  const restore = async()=>{
    await page.locator('#restore-draft').click()
    await page.locator('#confirm-restore').click()
    await page.locator('#recovery-dialog').waitFor({state:'hidden'})
  }
  await restore()
  assert.deepEqual(await snapshot(),second)
  await restore()
  assert.deepEqual(await snapshot(),final)

  const dbCheck = await page.evaluate(async()=>{
    const {writeChanges,readWorkspace,restorePrevious,recoverySummary} = await import('./src/storage.js')
    const {newEntry} = await import('./src/discussion.js')
    const key=crypto.randomUUID(), note={id:'n',type:'note',text:'Body',color:'#aaaaaa',page:1,point:[0,0]}
    await writeChanges(key,[],[note])
    const root=newEntry('A','Jon'), second=newEntry('B','Lea')
    await Promise.all([writeChanges(key,[note],[{...note,replies:[root]}]),writeChanges(key,[note],[{...note,replies:[second]}])])
    const stored=await readWorkspace(key)
    const copy=await recoverySummary(key)
    const sets={...stored.sets,names:['Review']}
    await writeChanges(key,stored.marks,stored.marks,stored.sets,sets)
    let stale=false
    try { await restorePrevious(key,copy.token) } catch { stale=true }
    const backup=await recoverySummary(key)
    await writeChanges(key,stored.marks,stored.marks,sets,{...sets,hidden:['Review']})
    const afterHide=await recoverySummary(key)
    await restorePrevious(key,backup.token)
    const restored=await readWorkspace(key)
    return {replies:restored.marks[0].replies.map(entry=>entry.text).sort(),names:restored.sets.names,
      stale,unchanged:backup.token===afterHide.token}
  })
  assert.deepEqual(dbCheck,{replies:['A','B'],names:[],stale:true,unchanged:true})
}
