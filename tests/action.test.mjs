import test from 'node:test'
import assert from 'node:assert/strict'
import {runInNewContext} from 'node:vm'
import {readFile} from 'node:fs/promises'

test('toolbar delivers the clicked PDF once, to the editor tab it opened',async()=>{
  let click, message, close, address, nextId=10
  const memory = new Map(), editor='chrome-extension://example/index.html'
  const chrome={
    runtime:{id:'example',getURL:()=>editor,onMessage:{addListener:fn=>{message=fn}}},
    action:{onClicked:{addListener:fn=>{click=fn}}},
    tabs:{create:async({url})=>{address=url;return {id:++nextId}},
      update:async(_id,{url})=>{address=url},onRemoved:{addListener:fn=>{close=fn}}},
    storage:{session:{set:async v=>Object.entries(v).forEach(([k,val])=>memory.set(k,val)),
      get:async k=>({[k]:memory.get(k)}),remove:async k=>memory.delete(k)}}
  }
  runInNewContext(await readFile('extension/background.js','utf8'),{chrome,URL})
  await click({url:'https://example.org/a%20b.PDF?download=1#page=2'})
  assert.equal(address,editor+'#open')
  const sender={url:address,frameId:0,id:'example',tab:{id:nextId}}
  const claim=s=>new Promise(resolve=>{if(!message('open-clicked-pdf',s,resolve))resolve(null)})
  assert.equal(await claim({...sender,tab:{id:0}}),null)
  assert.equal(await claim({...sender,frameId:1}),null)
  assert.deepEqual(await Promise.all([claim(sender),claim(sender)]),['https://example.org/a%20b.PDF?download=1',null])
  assert.equal(await claim(sender),null)
  await click({url:'https://example.org/b.pdf'})
  await close(nextId)
  assert.equal(memory.size,0)
  await click({url:'https://example.org/'})
  assert.equal(address,editor)
})
