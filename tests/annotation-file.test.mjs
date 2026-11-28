import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { exportAnnotations, readAnnotations, mergeAnnotations } from '../dist/src/annotation-file.js'

const pdf = await readFile('extension/assets/reading-the-alps.pdf')
const hash = createHash('sha256').update(pdf).digest('hex')
const sample = JSON.parse(await readFile('extension/assets/sample-annotations.json'))
const drawing = {id:'pencil', page:2, type:'draw', text:'Pencil', color:'#91b9dd', points:[[0,.1],[1,.75]]}
const entries = [...sample, drawing]
const file = (...annotations) => exportAnnotations(hash,3,annotations)
const packageData = JSON.parse(await file(...entries).text())

test('the guide shipped in the ZIP contains a working import for the bundled sample',async()=>{
  const guide = await readFile('dist/ANNOTATIONS.md','utf8')
  assert.equal(guide,await readFile('docs/annotation-migration.md','utf8'))
  const example = guide.match(/^```json\n([\s\S]*?)\n```$/m)
  assert.ok(example)
  const [mark] = await readAnnotations(new Blob([example[1]]),hash,3)
  assert.equal(mark.id,'alps-review-note')
})

test('the migration file contains only versioned annotation data and the exact PDF fingerprint', async () => {
  assert.deepEqual(Object.keys(packageData).sort(),['annotations','documentSha256','format','version'])
  assert.equal(packageData.format,'margin-annotations')
  assert.equal(packageData.version,1)
  assert.equal(packageData.documentSha256,hash)
  assert.deepEqual(await readAnnotations(file(...entries),hash,3),entries)
  assert.deepEqual(await readAnnotations(file(),hash,3),[])
  const different = createHash('sha256').update(pdf).update('\n').digest('hex')
  await assert.rejects(readAnnotations(file(...entries),different,3),/fingerprint does not match/)
})

test('region notes require v6, a comment, and a positive rectangle inside the page', async () => {
  const region = {id:'map',page:2,type:'region',point:[.65,.40],size:[.2,.12],text:'Verify the scale.',color:'#35768c',done:false}
  const transfer = JSON.parse(await file(...entries,region).text())
  assert.equal(transfer.version,6)
  const decode = (version,marks)=>readAnnotations(new Blob([JSON.stringify({...transfer,version,annotations:marks})]),hash,3)
  assert.deepEqual(await decode(6,transfer.annotations),[...entries,region])
  const [moved] = await decode(6,[{...region,point:[.1,.25],done:true}])
  const merge = mergeAnnotations([region],[moved])
  assert.equal(merge.updated,1)
  assert.deepEqual(merge.marks,[moved])
  for (const version of [1,2,3,4,5]) await assert.rejects(decode(version,[region]),/Invalid/)
  for (const patch of [{size:undefined},{point:undefined},{text:' '},{done:1},{size:[0,.3]},
    {size:[.5,.4]},{point:[.3,.99]},{style:'outline-box'},{rects:[[.1,.2,.3,.4]]}]) {
    await assert.rejects(decode(6,[drawing,{...region,...patch}]),/Invalid/)
  }
})

test('invalid or oversized packages are rejected as a whole', async () => {
  for (const patch of [
    {format:'workspace'}, {version:7}, {documentSha256:'unknown'}, {pdfBytes:[]}, {annotations:{}},
    {annotations:[drawing,drawing]}, {annotations:[drawing,{...sample[0],page:4}]},
    {annotations:[{...drawing,points:[[1.1,1],[0,0]]}]}, {annotations:[{...drawing,attachment:'x'}]},
    {annotations:Array(2001).fill(drawing)}
  ]) {
    const blob = new Blob([JSON.stringify({...packageData,...patch})])
    await assert.rejects(readAnnotations(blob,hash,3))
  }
  await assert.rejects(readAnnotations(new Blob(['{']),hash,3),/JSON file/)
  await assert.rejects(readAnnotations({size:16*1024*1024+1},hash,3),/16 MiB/)
})

test('passage comments preserve quotes and reject incompatible versions or invalid anchors', async () => {
  const passages = [1,2].map(page => ({page,quote:'Line ' + page,rects:[[.2,.3,.4,.05]]}))
  const comment = {id:'quote-1',type:'comment',page:1,color:'#91b9dd',text:'Verify the figures.',passages,done:false}
  const data = JSON.parse(await file(comment).text())
  assert.equal(data.version,3)
  const incoming = await readAnnotations(file(comment),hash,3)
  assert.deepEqual(incoming,[comment])
  assert.equal(mergeAnnotations([comment],incoming).updated,0)
  for (const parts of [[], [...passages].reverse(), [passages[0],passages[0]], [{...passages[0],page:4}],
    [passages[0],{...passages[1],page:4}], [{...passages[0],rects:[]}], [{...passages[0],quote:' '}],
    [{...passages[0],link:'unknown'}]]) {
    assert.throws(() => file({...comment,passages:parts}),/Invalid/)
  }
  for (const version of [1,2]) {
    await assert.rejects(readAnnotations(new Blob([JSON.stringify({...data,version})]),hash,3),/Invalid/)
  }
})

test('action checkboxes round-trip, update and clear through versioned migrations', async () => {
  const note = sample.find(mark => mark.type === 'note')
  const plain = JSON.parse(await file(note).text())
  assert.equal(plain.version,1)
  for (const done of [false,true]) {
    const tracked = {...note,done}
    const encoded = file(tracked)
    assert.equal(JSON.parse(await encoded.text()).version,2)
    const imported = await readAnnotations(encoded,hash,3)
    assert.deepEqual(imported,[tracked])
    assert.equal(mergeAnnotations([note],imported).updated,1)
    assert.equal(mergeAnnotations([tracked],imported).updated,0)
    assert.deepEqual(mergeAnnotations([tracked],await readAnnotations(file(note),hash,3)).marks,[note])
  }
  for (const [version,mark] of [[1,{...note,done:false}],[2,{...note,done:'false'}],
    [2,{...note,done:null}],[2,{...drawing,done:true}]]) {
    const blob = new Blob([JSON.stringify({...plain,version,annotations:[mark]})])
    await assert.rejects(readAnnotations(blob,hash,3),/Invalid/)
  }
})

test('version 4 preserves each text markup style and imports it once', async () => {
  const base = sample.find(mark=>mark.type === 'highlight')
  const note = sample.find(mark=>mark.type === 'note')
  const styles = ['underline','dashed-underline','dotted-underline','strikethrough','outline-box']
  const marks = styles.map(style=>({...base,id:style,style}))
  marks.push({id:'comment',type:'comment',page:1,color:base.color,text:'Check units',done:true,
    style:'dotted-underline',passages:[{page:1,quote:base.text,rects:base.rects}]})
  const data = JSON.parse(await file(...marks).text())
  assert.equal(data.version,4)
  const imported = await readAnnotations(file(...marks),hash,3)
  assert.deepEqual(imported,marks)
  assert.equal(mergeAnnotations(marks,imported).updated,0)
  const read = patch => readAnnotations(new Blob([JSON.stringify({...data,...patch})]),hash,3)
  for (const version of [1,2,3]) await assert.rejects(read({version,annotations:[marks[0]]}),/Invalid/)
  for (const style of ['highlight','unknown','__proto__',12,null]) {
    await assert.rejects(read({annotations:[{...base,style}]}),/Invalid/)
  }
  for (const mark of [note,drawing]) {
    await assert.rejects(read({annotations:[{...mark,style:'underline'}]}),/Invalid/)
  }
  const filled = {...base,id:marks[0].id}
  const restored = mergeAnnotations([marks[0]],await readAnnotations(file(filled),hash,3))
  assert.deepEqual(restored.marks,[filled])
  assert.equal(JSON.parse(await file(...restored.marks).text()).version,1)
})

test('merging updates by ID, keeps unrelated marks, and is idempotent', async () => {
  const local = { ...sample[1], text:'Previous note' }
  const onlyHere = { ...drawing, id:'local-only' }
  const incoming = await readAnnotations(file(...entries),hash,3)
  const merged = mergeAnnotations([onlyHere,local],incoming)
  assert.equal(merged.added,3)
  assert.equal(merged.updated,1)
  assert.equal(merged.marks[0],onlyHere)
  assert.deepEqual(merged.marks[1],sample[1])
  const again = mergeAnnotations(merged.marks,incoming)
  assert.equal(again.added,0)
  assert.equal(again.updated,0)
  again.marks.forEach((m,i)=>assert.equal(m,merged.marks[i]))
  assert.deepEqual(mergeAnnotations(again.marks,[]).marks,again.marks)
  const full = Array.from({length:2000},(_,i)=>({...onlyHere,id:'local'+i}))
  assert.throws(()=>mergeAnnotations(full,incoming),/limit/)
  assert.equal(full.length,2000)
})

test('version 5 transfers the size of a point note and can restore a compact marker', async () => {
  const compact = sample.find(mark=>mark.type==='note')
  const expanded = {...compact,size:[.3,.15],done:false}
  const data = JSON.parse(await file(expanded,drawing).text())
  assert.equal(data.version,5)
  const read = (version,annotation) => readAnnotations(new Blob([JSON.stringify({...data,version,annotations:[annotation]})]),hash,3)
  assert.deepEqual(await read(5,expanded),[expanded])
  for (const version of [1,2,3,4]) await assert.rejects(read(version,expanded),/Invalid/)
  for (const size of [null,{},[],[.3],[0,.3],[-1,.1],[.1,1.1],['.4',1],[1,1,1]]) {
    await assert.rejects(read(5,{...compact,size}),/Invalid/)
  }
  await assert.rejects(read(5,{...drawing,size:[.3,.2]}),/Invalid/)
  const restored = mergeAnnotations([expanded],await read(1,compact))
  assert.deepEqual(restored.marks,[compact])
  assert.equal(JSON.parse(await file(...restored.marks).text()).version,1)
})
