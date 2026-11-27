import { PDFDocument, PDFName, PDFDict, PDFHexString, PDFString } from '../vendor/pdf-lib.mjs'

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
function portable(mark) {
  const point = p => Array.isArray(p) && p.length === 2 && p.every(v => Number.isFinite(v) && v >= 0 && v <= 1)
  const rect = r => Array.isArray(r) && r.length === 4 && r.every(v => Number.isFinite(v) && v >= 0 && v <= 1)
  return mark && typeof mark.id === 'string' && typeof mark.text === 'string' && /^#[a-f0-9]{6}$/i.test(mark.color) && (
    (mark.type === 'note' && point(mark.point)) ||
    (mark.type === 'draw' && Array.isArray(mark.points) && mark.points.length > 1 && mark.points.every(point)) ||
    (mark.type === 'highlight' && Array.isArray(mark.rects) && mark.rects.length && mark.rects.every(rect))
  )
}

// Reconstruct the editable overlay from our own native annotations when an export is reopened.
export async function unpack(bytes) {
  const doc = await PDFDocument.load(bytes,{updateMetadata:false})
  const marks=[]
  for (const [i,page] of doc.getPages().entries()) {
    const annotations = page.node.Annots()
    if (!annotations) continue
    for (let j=0;j<annotations.size();) {
      const dict=annotations.lookup(j)
      const data=dict instanceof PDFDict && dict.lookup(N('MarginData'))
      let mark
      if (data instanceof PDFHexString || data instanceof PDFString) {
        try { mark=JSON.parse(data.decodeText()) } catch { /* Keep unrecognized PDF annotations in place. */ }
      }
      if (portable(mark)) {
        marks.push({...mark,page:i+1})
        annotations.remove(j)
      } else j++
    }
  }
  infoDict(doc).delete(N('MarginEditor'))
  return {bytes:await doc.save({updateFieldAppearances:false}),marks}
}

function appearance(doc, mark, viewport) {
  const width=viewport.width, height=viewport.height
  const pdfPoint=(x,y)=>viewport.convertToPdfPoint(x,y)
  const normalized=([x,y])=>pdfPoint(x*width,y*height)
  const command=(p,op)=>p.map(num).join(' ')+' '+op
  const polygon=points=>points.map((p,i)=>command(p,i?'l':'m')).join('\n')+'\nh f'
  const color=mark.color.match(/[0-9a-f]{2}/gi).map(v=>parseInt(v,16)/255)
  const strokeWidth=2.4 / viewport.userUnit
  const rgb=color.map(num).join(' ')
  const points=[]
  let ops=rgb+' rg\n', fields={}, pad=0
  if (mark.type==='highlight') {
    const quads=[]
    for (const [x,y,w,h] of mark.rects) {
      const corners=[[x,y],[x+w,y],[x,y+h],[x+w,y+h]].map(normalized)
      points.push(...corners)
      quads.push(...corners.flat())
      ops+=polygon([corners[0],corners[1],corners[3],corners[2]])+'\n'
    }
    fields={Subtype:'Highlight',QuadPoints:quads,CA:.48}
  } else if (mark.type==='draw') {
    points.push(...mark.points.map(normalized))
    ops+=rgb+' RG\n'+num(strokeWidth)+' w 1 J 1 j\n'+points.map((p,i)=>command(p,i?'l':'m')).join('\n')+'\nS'
    fields={Subtype:'Ink',InkList:[points.flat()],BS:{W:strokeWidth,S:'S'}}
    pad=strokeWidth/2
  } else {
    const [x,y]=mark.point
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
  const resources=mark.type==='highlight' ? {ExtGState:{GS:{Type:'ExtGState',ca:.48,BM:'Multiply'}}} : {}
  const stream=doc.context.flateStream('q\n'+(mark.type==='highlight'?'/GS gs\n':'')+ops+'\nQ',{
    Type:'XObject',Subtype:'Form',FormType:1,BBox:rect,Resources:resources
  })
  return {...fields,Rect:rect,C:color,AP:{N:doc.context.register(stream)}}
}

export async function exportDocument(bytes, marks, getViewport) {
  if (!marks.length) return bytes
  const doc=await PDFDocument.load(bytes,{updateMetadata:false})
  if (doc.isEncrypted) throw new Error('Encrypted PDFs cannot be exported by Margin.')
  const pages=doc.getPages(), views=new Map()
  for (const mark of marks) {
    if (!views.has(mark.page)) views.set(mark.page,await getViewport(mark.page))
    const page=pages[mark.page-1]
    const annotation=doc.context.obj({
      Type:'Annot',P:page.ref,F:4,T:S('Margin'),NM:S(mark.id),Contents:S(mark.text),
      MarginData:S(JSON.stringify(mark)),...appearance(doc,mark,views.get(mark.page))
    })
    page.node.addAnnot(doc.context.register(annotation))
  }
  infoDict(doc).set(N('MarginEditor'),PDFString.of('1'))
  return doc.save({updateFieldAppearances:false})
}
