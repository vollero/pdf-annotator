import { chromium } from 'playwright-core'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp,rm,readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { createServer } from 'node:http'
import path from 'node:path'
import { PDFDocument } from 'pdf-lib'
import { checkReadingControls } from './reading-controls.mjs'
import { checkNoteAppearance } from './note-appearance.mjs'
import { checkActionNotes } from './action-notes.mjs'
import { checkAnnotationSearch } from './annotation-search.mjs'
import { checkPassageComments } from './passage-comments.mjs'
import { checkTextMarkup } from './text-markup.mjs'

async function downloadAnnotations(page, directory) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button',{name:'Export annotations',exact:true}).click()
  ])
  assert.equal(await download.failure(),null)
  const name = download.suggestedFilename()
  const file = directory ? path.join(directory,name) : await download.path()
  return {name,mimeType:'application/json',buffer:await readFile(file)}
}

async function importAnnotations(page, file, message) {
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button',{name:'Import annotations',exact:true}).click()
  ])
  await chooser.setFiles(file)
  await page.locator('#toast').filter({hasText:message}).waitFor()
}

const dir=path.resolve(process.env.MARGIN_EXTENSION_DIR || 'dist'), profile=await mkdtemp(path.join(tmpdir(),'margin-browser-'))
const downloads = path.join(profile,'downloads')
const launch = () => chromium.launchPersistentContext(profile,{
  channel:'chromium',executablePath:process.env.CHROMIUM_PATH || undefined,
  headless:true,ignoreDefaultArgs:['--disable-extensions'],
  args:['--enable-unsafe-extension-debugging','--disable-extensions-except='+dir,'--load-extension='+dir],
  viewport:{width:1360,height:920},acceptDownloads:true,downloadsPath:downloads
})
let context = await launch()
try {
  const sw=context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker',{timeout:20000})
  const page=await context.newPage(),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  page.on('console',m=>{if(m.type()==='error') console.error(m.text())})
  await page.goto(new URL('index.html',sw.url()).href)
  async function ready() {await page.locator('.paper.current[data-ready="true"]').waitFor()}
  async function count(value) {await page.waitForFunction(n=>document.querySelector('#annotation-count').textContent===String(n),value)}
  async function saved() {await page.waitForFunction(()=>document.querySelector('#save-state').textContent==='Saved locally')}
  await ready();await count(3)
  assert.equal(await page.locator('.thumbnail').count(),3)
  const sampleText=page.locator('.paper.current .textLayer span').filter({hasText:'Every ridge holds'})
  await sampleText.first().waitFor()
  for (const width of [760,1360]) {
    await page.setViewportSize({width,height:920})
    const panel = await page.locator('#annotations-panel').boundingBox()
    for (const button of await page.locator('.annotation-files button').all()) {
      const box = await button.boundingBox()
      assert.ok(box.x >= panel.x && box.x + box.width <= panel.x + panel.width,'Annotation controls fit the panel')
      assert.ok(await button.evaluate(el=>el.scrollWidth <= el.clientWidth),'The full button label fits')
    }
  }
  await ready()
  if (process.env.MARGIN_PREVIEW_PATH) {
    await page.locator('.thumbnail canvas').nth(2).waitFor()
    await page.screenshot({path:process.env.MARGIN_PREVIEW_PATH,animations:'disabled'})
  }
  await checkNoteAppearance(page)
  // Check the text layer aligns with the rendered PDF at ordinary zoom.
  const line=await sampleText.first().boundingBox(), sheet=await page.locator('.paper.current').boundingBox()
  assert.ok(Math.abs((line.x-sheet.x)/sheet.width-46/612)<.012,
    'Sample text must align with the 46 pt left margin: ' + JSON.stringify({line,sheet,
      layer:await sampleText.first().evaluate(el => ({spanStyle:el.style.cssText,
        layerStyle:el.closest('.textLayer').style.cssText,paperScroll:el.closest('.paper').scrollLeft}))}))
  await page.locator('[data-tool="highlight"].tool').click()
  await page.mouse.move(line.x+1,line.y+line.height*.5)
  await page.mouse.down()
  await page.mouse.move(line.x+line.width*.4,line.y+line.height*.5,{steps:12})
  await page.mouse.up()
  await count(4)
  await page.locator('.tool[data-tool="draw"]').click()
  await page.mouse.move(sheet.x+60,sheet.y+80);await page.mouse.down()
  await page.mouse.move(sheet.x+100,sheet.y+90,{steps:6});await page.mouse.up()
  await count(5)
  await page.locator('.tool[data-tool="note"]').click()
  await page.mouse.click(sheet.x+90,sheet.y+100)
  await page.locator('#note-text').fill('Reviewed in Chromium — 注釈')
  await page.getByLabel('Track as action').check()
  await page.getByRole('button',{name:'Save note',exact:true}).click()
  await count(6)
  await page.locator('#undo').click();await count(5)
  await page.locator('#redo').click();await count(6);await saved()
  await page.reload();await ready();await count(6)
  await checkActionNotes(page)
  await checkAnnotationSearch(page)
  await page.locator('#next').click();await ready()
  assert.equal(await page.locator('#current').textContent(),'2')
  await page.locator('#filter').selectOption('current')
  assert.equal(await page.locator('.card').count(),1)
  await page.locator('#zoom-in').click();await ready()
  await page.locator('#fit').click();await ready()

  const original = await readFile(path.join(dir,'assets/reading-the-alps.pdf'))
  const fingerprint = bytes => createHash('sha256').update(bytes).digest('hex')
  const search = page.getByRole('searchbox',{name:'Search annotations'})
  await search.fill('page 99')
  const migration = await downloadAnnotations(page)
  const exportedMarks = JSON.parse(migration.buffer)
  assert.equal(exportedMarks.version,2)
  assert.equal(exportedMarks.annotations.find(m=>m.text.includes('Reviewed in Chromium')).done,true)
  assert.equal(migration.name,'Reading the Alps.margin-annotations.json')
  assert.equal(exportedMarks.documentSha256,fingerprint(original))
  assert.equal(exportedMarks.annotations.length,6,'Search and page filters do not limit the export')
  await search.fill('')
  await page.locator('.card .more').first().click()
  await page.getByRole('button',{name:'Delete',exact:true}).click()
  await count(5)
  await importAnnotations(page,migration,'1 added, 0 updated')
  await count(6)
  await page.locator('#undo').click();await count(5)
  await page.locator('#redo').click();await count(6);await saved()
  await page.reload();await ready();await count(6)

  const downloadPromise=page.waitForEvent('download')
  await page.locator('#export').click()
  const download=await downloadPromise
  assert.equal(download.suggestedFilename(),'Reading the Alps-annotated.pdf')
  const file=await download.path()
  const data=await readFile(file)
  const exported=await PDFDocument.load(data)
  assert.equal(exported.getPage(0).node.Annots().size(),5)
  await search.fill('no matching mark')
  await page.locator('#file').setInputFiles({name:'Reopened.pdf',mimeType:'application/pdf',buffer:data})
  await page.waitForFunction(()=>document.querySelector('#filename').textContent==='Reopened.pdf')
  await ready();await count(6)
  assert.equal(await search.inputValue(),'')
  assert.equal(JSON.parse((await downloadAnnotations(page)).buffer).documentSha256,fingerprint(data),
    'A reopened annotated PDF is identified by its actual input bytes')
  const card=page.locator('.card').filter({hasText:'Reviewed in Chromium'})
  assert.ok(await card.getByRole('checkbox').isChecked())
  await card.locator('.more').click()
  await card.getByRole('button',{name:'Edit note'}).click()
  assert.ok(await page.locator('#note-done').isChecked())
  await page.getByLabel('Track as action').uncheck()
  await page.getByRole('button',{name:'Cancel',exact:true}).click()
  assert.ok(await card.getByRole('checkbox').isChecked())
  await card.locator('.more').click()
  await card.getByRole('button',{name:'Edit note'}).click()
  await page.getByLabel('Track as action').uncheck()
  await page.locator('#note-text').fill('Updated comment')
  await page.getByRole('button',{name:'Save note',exact:true}).click()
  assert.equal(await page.locator('.card-check').count(),0)
  assert.ok(await page.locator('#action-filter').isHidden())
  await page.locator('.card').filter({hasText:'Updated comment'}).locator('.more').click()
  await page.getByRole('button',{name:'Delete',exact:true}).click()
  await count(5);await saved()
  await page.locator('#file').setInputFiles({name:'Invalid.pdf',mimeType:'application/pdf',buffer:Buffer.from('invalid')})
  await page.locator('#toast').filter({hasText:'could not be opened'}).waitFor()
  assert.equal(await page.locator('#filename').textContent(),'Reopened.pdf')
  await checkReadingControls(page)
  await checkPassageComments(page,downloadAnnotations,importAnnotations)
  await checkTextMarkup(page,downloadAnnotations,importAnnotations)
  // Exercise the toolbar's temporary host grant on a real PDF response with no CORS headers.
  const remote=await PDFDocument.create()
  remote.addPage([360,480])
  const remoteBytes=Buffer.from(await remote.save())
  const requests=[]
  const server=createServer((request,response)=>{
    if (request.url==='/Field-study.pdf') requests.push(request.headers)
    response.writeHead(200,{'Content-Type':'application/pdf','Content-Length':remoteBytes.length})
    response.end(remoteBytes)
  })
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  try {
    const browserCDP=await context.browser().newBrowserCDPSession()
    const tabIds=async()=>{
      const {targetInfos}=await browserCDP.send('Target.getTargets',{filter:[{type:'tab'}]})
      return targetInfos.map(info=>info.targetId)
    }
    await context.addCookies([{url:'http://127.0.0.1:'+server.address().port,name:'review_session',value:'test'}])
    const previous=new Set(await tabIds())
    const tab=await context.newPage()
    await tab.goto('http://127.0.0.1:'+server.address().port+'/Field-study.pdf',{waitUntil:'commit'})
    const [targetId]=(await tabIds()).filter(id=>!previous.has(id))
    assert.ok(targetId,'The PDF has a top-level tab target')
    const [editor]=await Promise.all([
      context.waitForEvent('page',{timeout:12000}),
      browserCDP.send('Extensions.triggerAction',{id:new URL(sw.url()).hostname,targetId})
    ])
    await editor.locator('#filename').filter({hasText:'Field-study.pdf'}).waitFor({timeout:12000})
    await editor.locator('.paper.current[data-ready="true"]').waitFor()
    assert.equal(await editor.locator('#total').textContent(),'1')
    const navigation=requests.find(h=>h['sec-fetch-mode']==='navigate')
    const imported=requests.find(h=>h['sec-fetch-mode']==='cors')
    assert.match(navigation?.cookie ?? '',/review_session=test/)
    assert.ok(imported,'The extension downloaded the selected PDF')
    assert.equal(imported.cookie,undefined)
    assert.equal(imported.referer,undefined)
    assert.equal(new URL(editor.url()).hash,'')
  } finally {
    server.closeAllConnections()
    await new Promise(resolve=>server.close(resolve))
  }
  // Open a real private window after granting Incognito access in this disposable profile.
  const extensionId = new URL(sw.url()).hostname
  const details = await context.newPage()
  await details.goto('chrome://extensions/?id=' + extensionId)
  await details.locator('#allow-incognito cr-toggle').click()
  await details.locator('#allow-incognito[checked]').waitFor()
  // Chromium may defer an access change until restart. Reopen the same test profile.
  await context.close()
  context = await launch()
  const launcher = await context.newPage()
  const editorUrl = new URL('index.html',sw.url()).href
  await launcher.goto(editorUrl)
  assert.equal(await launcher.evaluate(()=>chrome.extension.isAllowedIncognitoAccess()),true)
  const [privatePage] = await Promise.all([
    context.waitForEvent('page',{timeout:15000}),
    launcher.evaluate(url=>chrome.windows.create({incognito:true,url}),editorUrl)
  ])
  await privatePage.locator('#save-state').filter({hasText:'Private session'}).waitFor()
  assert.equal(await privatePage.evaluate(()=>chrome.extension.inIncognitoContext),true)
  await privatePage.locator('#file').setInputFiles({name:'Private review.pdf',mimeType:'application/pdf',buffer:remoteBytes})
  await privatePage.locator('#filename').filter({hasText:'Private review.pdf'}).waitFor()
  await privatePage.locator('#file').setInputFiles({name:'Reading the Alps.pdf',mimeType:'application/pdf',
    buffer:Buffer.concat([original,Buffer.from('\n')])})
  await privatePage.locator('#filename').filter({hasText:'Reading the Alps.pdf'}).waitFor()
  await importAnnotations(privatePage,migration,'fingerprint does not match')
  assert.equal(await privatePage.locator('#annotation-count').textContent(),'0')
  await privatePage.locator('#file').setInputFiles({name:'Renamed copy.pdf',mimeType:'application/pdf',buffer:original})
  await privatePage.locator('#filename').filter({hasText:'Renamed copy.pdf'}).waitFor()
  await importAnnotations(privatePage,migration,'6 added, 0 updated')
  await importAnnotations(privatePage,migration,'already in this document')
  assert.equal(await privatePage.locator('#annotation-count').textContent(),'6')
  // chrome.windows.create created this off-the-record context outside Playwright.
  // Configure downloads through its page since this context has no automation ID.
  const tabCDP = await context.newCDPSession(privatePage)
  await tabCDP.send('Page.setDownloadBehavior',{behavior:'allow',downloadPath:downloads})
  assert.deepEqual(JSON.parse((await downloadAnnotations(privatePage,downloads)).buffer),exportedMarks)
  assert.deepEqual(await privatePage.evaluate(()=>indexedDB.databases()),[])
  await privatePage.reload()
  await privatePage.locator('#filename').filter({hasText:'Reading the Alps.pdf'}).waitFor()
  assert.deepEqual(await privatePage.evaluate(()=>indexedDB.databases()),[])
  assert.deepEqual(errors,[])
  console.log('Chromium extension passed import, highlight, drawing, notes, history, autosave, navigation, zoom and PDF export/reopen.')
} finally {
  await context.close()
  await rm(profile,{recursive:true,force:true})
}
