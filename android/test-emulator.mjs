// The debug APK exposes its own WebView over adb's forwarded local port.
import assert from 'node:assert/strict'
import {chromium} from 'playwright-core'
import {execFileSync} from 'node:child_process'
import {setTimeout as sleep} from 'node:timers/promises'
const id='io.github.vollero.margin.dev'
const adb=(...args)=>execFileSync('adb',args,{encoding:'utf8'}).trim()
async function launch() {
  adb('shell','am','start','-W','-n',id+'/io.github.vollero.margin.ReaderActivity')
  const pid=adb('shell','pidof',id)
  adb('forward','tcp:9222','localabstract:webview_devtools_remote_'+pid)
  for(let i=0;i<60;i++) {
    try {if((await fetch('http://127.0.0.1:9222/json/version')).ok)break}catch{}
    await sleep(500)
  }
  const browser=await chromium.connectOverCDP('ws://127.0.0.1:9222/devtools/browser')
  const page=browser.contexts()[0].pages()[0]
  page.on('console',msg=>{if(msg.type()==='error')console.error(msg.text())})
  await page.locator('.paper.current[data-ready="true"]').waitFor()
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
process.exit(0)
