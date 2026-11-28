import assert from 'node:assert/strict'
import test from 'node:test'
import {blankPage,checkPage,nextRef,mergePages,pageHash} from '../extension/src/notebook-data.js'
import {exportBooks,readBooks} from '../extension/src/notebook-files.js'
import {exportAnnotations,readAnnotationFile} from '../extension/src/annotation-file.js'
import {inkPath} from '../extension/src/notebook-ink.js'

const sha='1'.repeat(64)
const note={id:'derivation',type:'note',text:'Work',page:1,color:'#226644',point:[.2,.3]}
test('50 dense editable pages round trip, with deferred installation and fingerprint verification',async()=>{
  const refs=[],storage=new Map()
  for(let i=0;i<50;i++) {
    const page=blankPage()
    for(let j=0;j<100;j++)page.strokes.push({id:'s'+i+'-'+j,tool:j%4?'pen':'highlight',color:'#114477',width:.003,
      points:Array.from({length:24},(_,k)=>[k/24,j/100,k/24])})
    checkPage(page)
    const rev=await pageHash(page)
    refs.push(nextRef(null,rev));storage.set(rev,new Blob([JSON.stringify(page)]))
  }
  const book={...note,notebook:refs},header=exportAnnotations(sha,1,[book])
  assert.equal(JSON.parse(await header.text()).version,13)
  await assert.rejects(readAnnotationFile(header,sha,1),/complete/)
  const file=await exportBooks(header,[book],rev=>storage.get(rev))
  let writes=0
  async function install(entries){writes++;assert.equal(entries.length,50)}
  await assert.rejects(readBooks(file,'2'.repeat(64),1,install),/fingerprint/)
  await assert.rejects(readBooks(file.slice(0,-1),sha,1,install))
  assert.equal(writes,0)
  assert.deepEqual((await readBooks(file,sha,1,install)).marks,[book]);assert.equal(writes,1)
})
test('a divergent revision gets a labeled, idempotent conflict copy',()=>{
  const base=nextRef(null,'1'.repeat(64)), a=nextRef(base,'2'.repeat(64)),b=nextRef(base,'3'.repeat(64))
  assert.deepEqual(mergePages([base],[a]),[a])
  const result=mergePages([a],[b])
  assert.deepEqual(result.map(r=>r.rev),[a.rev,b.rev]);assert.equal(result[1].conflict,true)
  assert.deepEqual(mergePages(result,[b]),result)
  assert.deepEqual(mergePages([a],[base]),[a])
  const edited=nextRef(result[1],'4'.repeat(64))
  assert.deepEqual(mergePages([a,edited],[b]),[a,edited])
  const long='n'.repeat(128), longResult=mergePages([{...a,id:long}],[{...b,id:long}])
  assert.equal(longResult.length,2)
  const occupied={...base,id:result[1].id}
  const collision=mergePages([a,occupied],[b])
  assert.deepEqual(collision.map(r=>r.rev),[a.rev,base.rev,b.rev])
  assert.deepEqual(mergePages(collision,[b]),collision)
})
test('pressure affects vector geometry, including a handwritten dot',()=>{
  const s={width:.005,tool:'pen',points:[[.4,.4,.2]]}
  assert.notEqual(inkPath(s),inkPath({...s,points:[[.4,.4,.9]]}))
  assert.throws(()=>checkPage({...blankPage(),strokes:[{...s,id:'a',color:'#dd0055',points:[[1,1,3]]}]}))
})
