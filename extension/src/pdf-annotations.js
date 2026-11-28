import { threadRows } from './discussion.js'
import { readMark, readDraft, maxMarkCount, noteStatus, fitNotePoint, noteDimensions } from './mark-data.js'
import { noteTextMask } from './note-text-mask.js'
import { noteTextRuns, readableNoteText } from './note-format.js'
import { DocumentLimitError } from './input.js'
import { markupStrokes } from './markup.js'
import { PDFDocument, PDFName, PDFDict, PDFHexString, PDFString, PDFRef, PDFArray, PDFStream } from '../vendor/pdf-lib.mjs'

const N = PDFName.of
const S = PDFHexString.fromText
const num = value => Number(value.toFixed(4)).toString()
function infoDict(doc) {
  const context = doc.context
  let info = context.lookupMaybe(context.trailerInfo.Info, PDFDict)
  if (!info) {
    info = context.obj({})
    context.trailerInfo.Info = context.register(info)
  }
  return info
}
// pdf-lib serializes every registered object, including objects detached from pages.
// Follow trailer roots so shared resources, forms and ordinary annotations survive.
function removeUnreachable(context) {
  const pending = Object.values(context.trailerInfo), seen = new Set()
  while (pending.length) {
    const object = pending.pop()
    if (!object || seen.has(object)) continue
    seen.add(object)
    if (object instanceof PDFRef) pending.push(context.lookup(object))
    else if (object instanceof PDFStream) pending.push(object.dict)
    else if (object instanceof PDFDict) {
      for (const value of object.values()) pending.push(value)
    } else if (object instanceof PDFArray) {
      for (let i = 0; i < object.size(); i++) pending.push(object.get(i))
    }
  }
  let removed = false
  for (const [ref] of context.enumerateIndirectObjects()) {
    if (!seen.has(ref)) { context.delete(ref); removed = true }
  }
  return removed
}

function purgeDetachedMarks(doc, detached = new Set()) {
  for (const [, object] of doc.context.enumerateIndirectObjects()) {
    if (object instanceof PDFDict && object.get(N('Type')) === N('Annot') && (object.has(N('MarginData')) || object.has(N('MarginCommentRoot')))) {
      detached.add(object)
    }
  }
  if (!detached.size) return false
  for (const page of doc.getPages()) {
    const active = page.node.Annots()
    if (!active) continue
    for (let i = 0; i < active.size(); i++) detached.delete(active.lookup(i))
  }
  if (!detached.size) return false
  // A reply from another editor can still reference a retired annotation.
  // Preserve the reply relationship while erasing the old payload and geometry.
  for (const dict of detached) {
    for (const field of ['Contents','T','CreationDate','M','MarginData','MarginCommentRoot','AP','RC','InkList','QuadPoints']) dict.delete(N(field))
    dict.set(N('Rect'), doc.context.obj([0,0,0,0]))
  }
  removeUnreachable(doc.context)
  return true
}

export async function unpack(bytes) {
  const doc = await PDFDocument.load(bytes,{updateMetadata:false})
  const marks = []
  const detached = new Set()
  const continuationPages = new Map()
  let encodedSize = 0
  for (const [i,page] of doc.getPages().entries()) {
    const annotations = page.node.Annots()
    if (!annotations) continue
    const kept = []
    for (let j = 0; j < annotations.size(); j++) {
      const dict = annotations.lookup(j)
      const root = dict instanceof PDFDict && dict.get(N('MarginCommentRoot'))
      if (root && continuationPages.get(root)?.delete(i + 1)) {
        detached.add(dict)
        continue
      }
      const data = dict instanceof PDFDict && dict.lookup(N('MarginData'))
      let mark
      if (data instanceof PDFHexString || data instanceof PDFString) {
        encodedSize += data.sizeInBytes()
        if (encodedSize > 32 * 1024 * 1024 || data.sizeInBytes() > 8 * 1024 * 1024) {
          throw new DocumentLimitError('This PDF exceeds the editable annotation data limit.')
        }
        let raw
        try { raw = JSON.parse(data.decodeText()) } catch { /* Preserve unrecognized native annotations. */ }
        mark = readMark(raw, i + 1, doc.getPageCount())
      }
      if (mark) {
        if (mark.type === 'comment') continuationPages.set(annotations.get(j),new Set(mark.passages.slice(1).map(part => part.page)))
        marks.push(mark)
        if (marks.length > maxMarkCount) throw new DocumentLimitError('This PDF exceeds the editable annotation limit.')
        detached.add(dict)
      } else kept.push(annotations.get(j))
    }
    if (kept.length !== annotations.size()) page.node.set(N('Annots'), doc.context.obj(kept))
  }
  const draft = readDraft(marks, doc.getPageCount())
  infoDict(doc).delete(N('MarginEditor'))
  purgeDetachedMarks(doc, detached)
  return {bytes:await doc.save({updateFieldAppearances:false}), marks:draft}
}

function appearance(doc, mark, viewport, noteFont) {
  const width=viewport.width, height=viewport.height
  const pdfPoint=(x,y)=>viewport.convertToPdfPoint(x,y)
  const normalized=([x,y])=>pdfPoint(x*width,y*height)
  const command=(p,op)=>p.map(num).join(' ')+' '+op
  const polygon=points=>points.map((p,i)=>command(p,i?'l':'m')).join('\n')+'\nh f'
  const color=mark.color.match(/[0-9a-f]{2}/gi).map(v=>parseInt(v,16)/255)
  const strokeWidth=2.4 / viewport.userUnit
  const rgb=color.map(num).join(' ')
  const points=[]
  let ops=rgb+' rg\n', fields={}, pad=0, resources={}
  if (mark.type==='highlight') {
    const quads=[]
    for (const [x,y,w,h] of mark.rects) {
      const corners=[[x,y],[x+w,y],[x,y+h],[x+w,y+h]].map(normalized)
      points.push(...corners)
      quads.push(...corners.flat())
      if (!mark.style) ops+=polygon([corners[0],corners[1],corners[3],corners[2]])+'\n'
    }
    if (mark.style) {
      ops = rgb+' RG\n1 j\n'
      for (const stroke of markupStrokes(mark.rects,width,height,mark.style)) {
        const dash = (stroke.dash ?? []).map(n=>num(n/viewport.userUnit)).join(' ')
        ops += num(stroke.thickness/viewport.userUnit)+' w ['+dash+'] 0 d '+(stroke.dotted ? 1 : 0)+' J\n'
        ops += stroke.points.map(([x,y],i)=>command(pdfPoint(x,y),i ? 'l' : 'm')).join('\n')+(stroke.closed ? '\nh S\n' : '\nS\n')
      }
      fields = mark.style === 'outline-box' ? {Subtype:'Square'} :
        {Subtype:mark.style === 'strikethrough' ? 'StrikeOut' : 'Underline',QuadPoints:quads}
    } else fields={Subtype:'Highlight',QuadPoints:quads,CA:.48}
  } else if (mark.type==='draw') {
    for (const point of mark.points) points.push(normalized(point))
    ops+=rgb+' RG\n'+num(strokeWidth)+' w 1 J 1 j\n'+points.map((p,i)=>command(p,i?'l':'m')).join('\n')+'\nS'
    fields={Subtype:'Ink',InkList:[points.flat()],BS:{W:strokeWidth,S:'S'}}
    pad=strokeWidth/2
  } else if (mark.size) {
    const [w,h] = noteDimensions(mark,width,height)
    const [x,y] = fitNotePoint(mark.point,width,height,mark)
    const pt = (dx,dy)=>pdfPoint(x*width+dx,y*height+dy)
    const corners = [pt(0,0),pt(w,0),pt(w,h),pt(0,h)]
    points.push(...corners)
    const [bl,br,tl] = [corners[3],corners[2],corners[0]]
    const matrix = [br[0]-bl[0],br[1]-bl[1],tl[0]-bl[0],tl[1]-bl[1],...bl]
    const status = noteStatus(mark)
    const mask = noteTextMask(noteTextRuns(mark,status),w,h,noteFont)
    const image = doc.context.flateStream(mask.bytes,{Type:'XObject',Subtype:'Image',Width:mask.width,
      Height:mask.height,ImageMask:true,BitsPerComponent:1})
    resources = {XObject:{TextMask:doc.context.register(image)},Font:{Helv:{Type:'Font',Subtype:'Type1',BaseFont:'Helvetica'}}}
    ops += polygon(corners)+'\n1 .992 .961 rg\n'+polygon([pt(2,2),pt(w-2,2),pt(w-2,h-2),pt(2,h-2)])+
      '\n.16 .17 .16 rg\n'+matrix.map(num).join(' ')+' cm /TextMask Do'
    fields = {Subtype:'FreeText',DA:PDFString.of('/Helv '+num(noteFont.fontSize/viewport.userUnit)+' Tf 0 g')}
  } else {
    const [x,y]=fitNotePoint(mark.point,width,height,mark)
    const pt=(dx,dy)=>pdfPoint(x*width+dx,y*height+dy)
    points.push(pt(0,0),pt(18,18))
    ops+=polygon([pt(1,1),pt(17,1),pt(17,13),pt(11,13),pt(6,17),pt(6,13),pt(1,13)])
    ops+='\n0.23 G 1 w\n'+command(pt(4,5),'m')+' '+command(pt(14,5),'l')+' S\n'+command(pt(4,8),'m')+' '+command(pt(11,8),'l')+' S'
    fields={Subtype:'Text',Name:'Comment',Open:false}
  }
  const rect=[Infinity,Infinity,-Infinity,-Infinity]
  for(const [x,y] of points) {
    rect[0]=Math.min(rect[0],x-pad); rect[1]=Math.min(rect[1],y-pad)
    rect[2]=Math.max(rect[2],x+pad); rect[3]=Math.max(rect[3],y+pad)
  }
  const filled = fields.Subtype === 'Highlight'
  if (filled) resources.ExtGState = {GS:{Type:'ExtGState',ca:.48,BM:'Multiply'}}
  const stream=doc.context.flateStream('q\n'+(filled?'/GS gs\n':'')+ops+'\nQ',{
    Type:'XObject',Subtype:'Form',FormType:1,BBox:rect,Resources:resources
  })
  return {...fields,Rect:rect,C:color,AP:{N:doc.context.register(stream)}}
}

export async function exportDocument(bytes, marks, getViewport, noteFont = {fontSize:18,fontFamily:'sans-serif'}) {
  const doc=await PDFDocument.load(bytes,{updateMetadata:false})
  if (doc.isEncrypted) throw new Error('Encrypted PDFs cannot be exported by Margin.')
  // Earlier releases could leave detached Margin notes even in a file with no
  // live annotations or MarginEditor flag. Clean those on a fresh export too.
  const cleaned = purgeDetachedMarks(doc)
  if (!marks.length) return cleaned ? doc.save({updateFieldAppearances:false}) : bytes
  const pages=doc.getPages(), views=new Map()
  for (const mark of marks) {
    const status = noteStatus(mark)
    const readable = readableNoteText(mark)
    const tagLine = mark.tags ? '\n\nTags: '+mark.tags.join(', ') : ''
    const transcript = threadRows(mark.replies).map(({entry,number,parentNumber})=>{
      const target = parentNumber ? ' to #'+parentNumber : ''
      return 'Reply #'+number+target+' · '+(entry.author ?? 'Anonymous')+' · '+entry.at+'\n'+entry.text
    })
    const text = S([(status ? status + ': ' : '') + readable + tagLine,...transcript].join('\n\n'))
    const {history,notebook,...sharedMark} = mark
    const contents = mark.passages?.length > 1 ? doc.context.register(text) : text
    let root
    for (const part of mark.passages ?? [mark]) {
      if (!views.has(part.page)) views.set(part.page,await getViewport(part.page))
      const page=pages[part.page-1]
      let painted = mark
      if (mark.type === 'comment') painted = {type:'highlight',color:mark.color,style:mark.style,rects:part.rects}
      if (mark.type === 'region') painted = {type:'highlight',color:mark.color,style:'outline-box',rects:[[...mark.point,...mark.size]]}
      const annotation=doc.context.obj({
        Type:'Annot',P:page.ref,F:4,T:S(mark.author ?? 'Margin'),NM:S(mark.id),Contents:contents,
        ...(mark.createdAt ? {CreationDate:PDFString.fromDate(new Date(mark.createdAt))} : {}),
        ...(mark.updatedAt ? {M:PDFString.fromDate(new Date(mark.updatedAt))} : {}),
        ...(root ? {MarginCommentRoot:root} : {MarginData:S(JSON.stringify(sharedMark))}),...appearance(doc,painted,views.get(part.page),noteFont)
      })
      const ref = doc.context.register(annotation)
      page.node.addAnnot(ref)
      root ??= ref
    }
  }
  infoDict(doc).set(N('MarginEditor'),PDFString.of('1'))
  return doc.save({updateFieldAppearances:false})
}
