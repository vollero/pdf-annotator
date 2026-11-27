import test from 'node:test'
import assert from 'node:assert/strict'
import {runInNewContext} from 'node:vm'
import {readFile} from 'node:fs/promises'

test('toolbar opens a PDF tab in the workspace and opens the editor from other tabs',async()=>{
  let click, next
  const chrome={
    runtime:{getURL:name=>'chrome-extension://example/'+name},
    action:{onClicked:{addListener:listener=>{click=listener}}},
    tabs:{create:({url})=>{next=new URL(url)}}
  }
  runInNewContext(await readFile('extension/background.js','utf8'),{chrome,URL,URLSearchParams})
  click({url:'https://example.org/a%20b.PDF?download=1#page=2'})
  assert.equal(new URLSearchParams(next.hash.slice(1)).get('source'),'https://example.org/a%20b.PDF?download=1')
  click({url:'https://example.org/'})
  assert.equal(next.href,'chrome-extension://example/index.html')
})
