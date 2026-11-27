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

test('invalid or oversized packages are rejected as a whole', async () => {
  for (const patch of [
    {format:'workspace'}, {version:3}, {documentSha256:'unknown'}, {pdfBytes:[]}, {annotations:{}},
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
