import test from 'node:test'
import assert from 'node:assert/strict'
import { applyDiscussionChanges, checkDiscussion, newEntry, saveHistory, threadRows } from '../extension/src/discussion.js'
import { exportAnnotations, mergeAnnotations, readAnnotations } from '../extension/src/annotation-file.js'
import { readMark } from '../extension/src/mark-data.js'

const sourced = {id:'pin',type:'note',page:1,point:[.1,.1],color:'#aaddcc',text:'Original',author:'Lea'}
const hash = 'a'.repeat(64)
test('history is per note, records the contributor and only captures edits while enabled',()=>{
  const edited = {...sourced,text:'Changed',textFormat:'markdown'}
  assert.equal(saveHistory(sourced,edited,false,'Jon'),undefined)
  const history = saveHistory(sourced,edited,true,'Jon')
  assert.deepEqual(history.versions.map(v=>[v.text,v.author,v.textFormat,v.baseline]),[
    ['Original','Jon',undefined,true],['Changed','Jon','markdown',undefined]
  ])
  assert.strictEqual(saveHistory({...edited,history},{...edited,done:true},true,'Anu'),history)
  const paused = saveHistory({...edited,history},edited,false,'Jon')
  const latest = {...edited,text:'Untracked',history:paused}
  assert.strictEqual(saveHistory(latest,{...latest,text:'Another edit'},false,'Anu'),paused)
  const resumed = saveHistory(latest,{...latest,text:'Original'},true,'Anu')
  assert.deepEqual(resumed.versions.slice(2).map(v=>[v.text,v.author,v.baseline]),[
    ['Untracked','Anu',true],['Original','Anu',undefined]
  ])
})

test('thread migrations merge branches and revisions by ID and reject conflicting entries atomically',async()=>{
  const root = newEntry('Please cite a source','Lea')
  const child = {...newEntry('Added the paper','Jon'),parent:root.id}
  const grandchild = {...newEntry('Verified','Anu'),parent:child.id}
  const other = newEntry('Separate issue','Kim')
  const history = saveHistory(null,sourced,true,'Lea')
  const local = {...sourced,replies:[root,other],history}
  const incoming = {...sourced,replies:[root,child,grandchild],text:'Updated',
    history:saveHistory({...sourced,history},{text:'Updated'},true,'Jon')}
  const blob = exportAnnotations(hash,1,[incoming])
  assert.equal(JSON.parse(await blob.text()).version,11)
  const records = await readAnnotations(blob,hash,1)
  const {marks:[merged]} = mergeAnnotations([local],records)
  assert.deepEqual(threadRows(merged.replies).map(r=>[r.entry.text,r.number,r.parentNumber]),[
    [root.text,1,undefined],[child.text,2,1],[grandchild.text,3,2],[other.text,4,undefined]
  ])
  assert.deepEqual(merged.history,incoming.history)
  assert.equal(mergeAnnotations([merged],records).updated,0)
  const older = mergeAnnotations([merged],[sourced]).marks[0]
  assert.deepEqual(older.replies,merged.replies)
  assert.deepEqual(older.history,merged.history)
  assert.throws(()=>mergeAnnotations([merged],[{...sourced,replies:[{...root,text:'Different'}]}]),/same ID/)
})

test('a concurrent reply and version survive another editor’s patch and undo',()=>{
  const a = newEntry('A','Lea'), b = newEntry('B','Jon')
  const c = {...newEntry('C','Jon'),parent:a.id}
  const prior = {...sourced,history:saveHistory(null,sourced,true,'Lea')}
  const edited = {...prior,text:'One',replies:[a],history:saveHistory(prior,{text:'One'},true,'Lea')}
  const latest = {...prior,text:'Two',replies:[b],history:saveHistory(prior,{text:'Two'},true,'Jon')}
  applyDiscussionChanges(latest,prior,edited)
  assert.deepEqual(latest.replies,[b,a])
  assert.deepEqual(latest.history.versions.map(v=>v.text),['Original','Two','One'])
  latest.replies.push(c)
  applyDiscussionChanges(latest,edited,prior)
  assert.deepEqual(latest.replies,[b,a,c])
  const undone = {...sourced}
  applyDiscussionChanges(undone,edited,{...edited,replies:[a,c]})
  assert.deepEqual(undone.replies,[a,c])
  assert.deepEqual(latest.history.versions.map(v=>v.text),['Original','Two'])
})

test('reject invalid parent links, dates, duplicate IDs, malformed actors and overlong discussions',()=>{
  const one = newEntry('hello','Ada')
  for (const replies of [[{...one,parent:one.id}],[{...one,parent:'missing'}],[one,one],
    [{...one,at:'2025-02-30T00:00:00.000Z'}],[{...one,author:'a\nb'}],[{...one,html:'x'}],
    Array.from({length:201},(_,i)=>({...one,id:'r'+i}))]) {
    assert.equal(readMark({...sourced,replies},1),undefined)
  }
  assert.throws(()=>checkDiscussion({history:{enabled:true,versions:[]}}))
  assert.equal(readMark({...sourced,type:'highlight',rects:[[0,0,1,1]],replies:[one]},1),undefined)
})
