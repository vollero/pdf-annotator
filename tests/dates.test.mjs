import test from 'node:test'
import assert from 'node:assert/strict'
import { annotationEvents,dateEdits,mergeDates } from '../extension/src/annotation-dates.js'
import { exportAnnotations,readAnnotationFile,mergeAnnotations } from '../extension/src/annotation-file.js'
import { readMark } from '../extension/src/mark-data.js'
const a='2026-01-02T00:00:00.000Z', b='2026-02-03T12:00:00.000Z', c='2026-03-04T12:00:00.000Z'
const hash='a'.repeat(64), pin={id:'n',type:'note',page:1,point:[0,0],text:'First',color:'#112233'}
test('new and existing marks receive only known dates, with stable creation and no dates for no-op edits',()=>{
  const [created]=dateEdits([],[pin],a)
  assert.deepEqual(created,{...pin,createdAt:a,updatedAt:a})
  assert.strictEqual(dateEdits([created],[{...created}],b)[0],created)
  const [edited]=dateEdits([created],[{...created,done:true}],b)
  assert.deepEqual(edited,{...created,done:true,updatedAt:b})
  assert.deepEqual(dateEdits([pin],[{...pin,text:'Old note revised'}],b)[0],{...pin,text:'Old note revised',updatedAt:b})
  const merged={...edited}
  mergeDates(merged,{...edited,updatedAt:c},created,edited)
  assert.equal(merged.updatedAt,c)
  mergeDates(merged,edited,edited,created)
  assert.deepEqual([merged.createdAt,merged.updatedAt],[a,a])
})
test('date migration validates both timestamps and retains earlier formats for undated marks',async()=>{
  const dated={...pin,createdAt:a,updatedAt:b}
  const file=await exportAnnotations(hash,1,[dated]).text(), data=JSON.parse(file)
  assert.equal(data.version,12)
  assert.deepEqual((await readAnnotationFile(new Blob([file]),hash,1)).marks,[dated])
  assert.equal(JSON.parse(await exportAnnotations(hash,1,[pin]).text()).version,1)
  for (const patch of [{createdAt:null},{createdAt:'2026-02-30T00:00:00.000Z'},{updatedAt:'2026-01-02'},{updatedAt:a,createdAt:c}]) {
    assert.equal(readMark({...dated,...patch},1),undefined)
  }
  await assert.rejects(readAnnotationFile(new Blob([JSON.stringify({...data,version:11})]),hash,1),/Invalid/)
  assert.equal(mergeAnnotations([dated],[pin]).updated,0)
  const {marks:[legacy]}=mergeAnnotations([dated],[{...pin,text:'Legacy import'}])
  assert.equal(legacy.createdAt,a)
  assert.equal(legacy.updatedAt,undefined)
})
test('annotation chronology includes opt-in wording history and replies on undated notes',()=>{
  const legacy={...pin,history:{enabled:true,versions:[{id:'v',at:a,text:'A',baseline:true}]},replies:[{id:'r',at:c,text:'R'}]}
  assert.deepEqual(annotationEvents([pin,legacy,{...pin,createdAt:b,updatedAt:b}]).map(e=>[e.kind,e.at]),
    [['Text captured',a],['Created',b],['Reply',c]])
})
