// The debug APK exposes its own WebView over adb's forwarded local port.
import assert from 'node:assert/strict'
import {chromium} from 'playwright-core'
import {execFileSync} from 'node:child_process'
import {setTimeout as sleep} from 'node:timers/promises'
const id='io.github.vollero.margin.dev'
const adb=(...args)=>execFileSync('adb',args,{encoding:'utf8',timeout:20000}).trim()
async function tapPickerItem(matches,navigateDownloads=false) {
  let xml='',openedDrawer=false,openedDownloads=false
  for(let i=0;i<12;i++) {
    const file='/data/local/tmp/margin-ui-'+i+'.xml'
    try {
      const result=adb('shell','uiautomator','dump',file)
      if(!result.includes('dumped')){await sleep(600);continue}
      xml=adb('shell','cat',file)
    } catch {await sleep(600);continue}
    const nodes=Array.from(xml.matchAll(/<node\b[^>]*>/g),m=>m[0])
    const target=nodes.find(matches)
    let fallback
    if(!target && navigateDownloads && !openedDownloads) {
      fallback=nodes.find(n=>/text="Downloads"/i.test(n) && /clickable="true"/.test(n))
      if(fallback)openedDownloads=true
      else if(!openedDrawer){fallback=nodes.find(n=>/content-desc="Show roots"/i.test(n));openedDrawer=!!fallback}
      else {fallback=nodes.find(n=>/text="Downloads"/i.test(n));openedDownloads=!!fallback}
    }
    for(const node of [target || fallback].filter(Boolean)) {
      const coords=node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/)
      if(!coords)continue
      const [,x,y,u,v]=coords.map(Number)
      adb('shell','input','tap',String((x+u)>>1),String((y+v)>>1))
      if(target)return
    }
    await sleep(500)
  }
  console.error(adb('shell','dumpsys','activity','activities').split('\n').filter(line=>line.includes('ResumedActivity')).slice(-3))
  console.error(xml.match(/text="[^"]+"/g)?.slice(0,70))
  throw Error('Expected document picker control was unavailable')
}
async function launch() {
  adb('shell','am','start','-W','-n',id+'/io.github.vollero.margin.ReaderActivity')
  const pid=adb('shell','pidof',id)
  adb('forward','tcp:9222','localabstract:webview_devtools_remote_'+pid)
  for(let i=0;i<60;i++) {
    try {if((await fetch('http://127.0.0.1:9222/json/version')).ok)break}catch{}
    await sleep(500)
  }
  const browser=await chromium.connectOverCDP('ws://127.0.0.1:9222/devtools/browser')
  const context=browser.contexts()[0]
  const page=context.pages()[0] ?? await context.waitForEvent('page')
  page.on('pageerror',e=>console.error(e.message))
  page.on('console',msg=>{if(msg.type()==='error')console.error(msg.text())})
  await page.locator('.paper.current[data-ready="true"]').waitFor({timeout:60000}).catch(async error=>{console.error(await page.locator('body').innerText());throw error})
  return {browser,page}
}
let {page}=await launch()
assert.match(await page.title(),/Reading the Alps/)
await page.locator('button[data-tool="note"]').click()
await page.locator('.paper.current').click({position:{x:60,y:80}})
await page.locator('#note-text').fill('Emulator derivation')
await page.locator('#write-book').click()
const sheet=page.locator('#book-sheet');await sheet.waitFor()
const bounds=await sheet.boundingBox()
const cdp=await page.context().newCDPSession(page)
const x=bounds.x+20,y=bounds.y+25
for(const [type,delta,force] of [['mousePressed',0,.25],['mouseMoved',20,.8],['mouseReleased',30,0]]) {
  await cdp.send('Input.dispatchMouseEvent',{type,x:x+delta,y:y+delta,button:'left',buttons:force?1:0,pointerType:'pen',force})
}
await page.locator('#book-status').filter({hasText:'Page saved'}).waitFor()
adb('shell','am','force-stop',id)
;({page}=await launch())
await page.locator('#book-sheet').waitFor()
assert.equal(await page.locator('#book-title').textContent(),'Emulator derivation')
assert.equal(await page.locator('#book-sheet path').count(),1)
console.log('Rendered the bundled PDF, wrote a pen stroke and recovered the open notebook after process death.')
await page.locator('#book-close').click()
await page.locator('#export-annotations').click()
await tapPickerItem(node=>/text="save"/i.test(node) && /enabled="true"/.test(node))
await page.locator('.card').filter({hasText:'Emulator derivation'}).locator('.more').click()
await page.getByRole('button',{name:'Delete',exact:true}).click()
await page.locator('#import-annotations').click()
await tapPickerItem(node=>/text="Reading the Alps\.marginbook(?:\.bin)?"/i.test(node),true)
await page.locator('#toast').filter({hasText:'1 added'}).waitFor()
await page.getByRole('button',{name:'Open notebook · 1 page'}).click()
await page.locator('#book-sheet path').waitFor()
console.log('Exported an editable package through Android DocumentsUI and restored its handwriting through the open picker.')
process.exit(0)
