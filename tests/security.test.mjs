import test from 'node:test'
import assert from 'node:assert/strict'
import { PDFDocument, PDFName, PDFString, PDFHexString } from 'pdf-lib'
import { exportDocument, unpack } from '../dist/src/pdf-annotations.js'
import { checkFileSize, maxFileBytes, readResponse } from '../dist/src/input.js'
import { readDraft } from '../dist/src/mark-data.js'

const N = PDFName.of
const note = {id:'review',page:1,type:'note',color:'#efc650',point:[.5,.5],text:'First review'}
const viewport = () => ({width:100,height:100,userUnit:1,convertToPdfPoint:(x,y)=>[x,100-y]})

test('removed and replaced Margin notes disappear from all serialized PDF objects', async () => {
  const source = await PDFDocument.create()
  source.addPage([100,100])
  const first = await exportDocument(await source.save(),[note],viewport)
  const restored = await unpack(first)
  const second = await exportDocument(restored.bytes,[{...note,text:'Final review'}],viewport)
  async function contents(bytes) {
    const doc = await PDFDocument.load(bytes)
    return doc.context.enumerateIndirectObjects().flatMap(([,obj])=>{
      const value = obj.get?.(N('Contents'))
      return value instanceof PDFHexString || value instanceof PDFString ? [value.decodeText()] : []
    })
  }
  assert.deepEqual(await contents(second),['Final review'])
  assert.deepEqual(await contents(await exportDocument(restored.bytes,[],viewport)),[])
  // Older exports can contain a detached object even after the last mark and editor flag are gone.
  const legacy = await PDFDocument.load(first)
  legacy.getPage(0).node.Annots().remove(0)
  legacy.context.lookup(legacy.context.trailerInfo.Info).delete(N('MarginEditor'))
  const cleaned = await exportDocument(await legacy.save(),[],viewport)
  assert.deepEqual(await contents(cleaned),[])
  assert.deepEqual(await exportDocument(cleaned,[],viewport),cleaned)
})

test('portable marks retain only fields used by the editor and each has its own identity',()=>{
  const marks = readDraft([note,{...note,extra:'importer metadata'},{...note,page:3}],1)
  assert.equal(marks.length,2)
  assert.equal(marks[0].id,note.id)
  assert.notEqual(marks[1].id,marks[0].id)
  assert.equal(Object.hasOwn(marks[1],'extra'),false)
  assert.deepEqual(readDraft([{...note,color:['#abcdef']}],1),[])
  assert.throws(()=>readDraft(Array(2001).fill(note),1),{name:'DocumentLimitError'})
})

test('file and streamed download ceilings are enforced before buffering the full source',async()=>{
  checkFileSize(maxFileBytes)
  assert.throws(()=>checkFileSize(maxFileBytes+1),{name:'DocumentLimitError'})
  assert.deepEqual(await readResponse(new Response(Uint8Array.of(1,2)),2),Uint8Array.of(1,2))
  for (const headers of [{},{'Content-Length':'3'}]) {
    let cancelled=false
    const body = new ReadableStream({pull(c){c.enqueue(Uint8Array.of(1,2,3))},cancel(){cancelled=true}})
    await assert.rejects(readResponse(new Response(body,{headers}),2),{name:'DocumentLimitError'})
    assert.equal(cancelled,true)
  }
})
