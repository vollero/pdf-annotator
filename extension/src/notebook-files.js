import {checkPage,pageHash} from './notebook-data.js'
import {readAnnotationFile} from './annotation-file.js'
const magic='MARGIN-NOTEBOOKS/1\n'
const cap=256*1024*1024
function pack(blob) {
  const length=new Uint8Array(4)
  new DataView(length.buffer).setUint32(0,blob.size)
  return [length,blob]
}
function revisions(marks) { return [...new Set(marks.flatMap(mark=>(mark.notebook ?? []).map(r=>r.rev)))] }
export async function exportBooks(header,marks,getBlob) {
  const pieces=[magic,...pack(header)]
  let size=magic.length+4+header.size
  for (const rev of revisions(marks)) {
    const blob=await getBlob(rev)
    if (!blob) throw Error('A notebook page could not be read.')
    if ((size+=4+blob.size)>cap) throw Error('This notebook package exceeds 256 MiB.')
    pieces.push(...pack(blob))
  }
  return new Blob(pieces,{type:'application/octet-stream'})
}
export async function isBookFile(file) { return await file.slice(0,magic.length).text()===magic }
export async function readBooks(file,sha,pages,saveBlobs) {
  if (file.size>cap || !await isBookFile(file)) throw Error('Invalid or oversized notebook package.')
  let offset=magic.length
  async function take(limit) {
    if (offset+4>file.size) throw Error('Incomplete notebook package.')
    const length=new DataView(await file.slice(offset,offset+4).arrayBuffer()).getUint32(0)
    offset+=4
    if (!length || length>limit || offset+length>file.size) throw Error('Invalid notebook record size.')
    const blob=file.slice(offset,offset+length)
    offset+=length
    return blob
  }
  const review=await readAnnotationFile(await take(16*1024*1024),sha,pages,true)
  const blobs=[]
  for (const rev of revisions(review.marks)) {
    const blob=await take(12*1024*1024)
    const page=JSON.parse(await blob.text())
    checkPage(page)
    if (await pageHash(page)!==rev) throw Error('A notebook page failed its integrity check.')
    blobs.push([rev,blob])
  }
  if (offset!==file.size) throw Error('Unexpected notebook package content.')
  await saveBlobs(blobs)
  return review
}
