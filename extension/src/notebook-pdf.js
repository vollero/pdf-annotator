import {W,H,inkPath,paperLines} from './notebook-ink.js'
import {PDFDocument,rgb} from '../vendor/pdf-lib.mjs'
export async function printNotebooks(books,source,getBlob) {
  const pdf=await PDFDocument.create()
  pdf.setTitle(books.map(b=>b.text).join(' · '))
  for(const book of books) {
    for(const [i,ref] of book.notebook.entries()) {
      const blob=await getBlob(ref.rev)
      if (!blob) throw Error('Missing notebook page.')
      const data=JSON.parse(await blob.text())
      const page=pdf.addPage([W+32,H+64])
      const canvas=document.createElement('canvas')
      canvas.width=1190;canvas.height=70
      const ctx=canvas.getContext('2d');ctx.scale(2,2)
      ctx.font='bold 14px sans-serif';ctx.fillText(book.text,0,14,W)
      ctx.font='10px sans-serif';ctx.fillText(source+' · PDF page '+book.page+' · Notebook '+(i+1)+' / '+book.notebook.length,0,30,W)
      const heading=await pdf.embedPng(canvas.toDataURL())
      page.drawImage(heading,{x:16,y:H+22,width:W,height:35})
      for(const [x,y,u,v] of paperLines(data.paper)) page.drawLine({start:{x:x+16,y:H+16-y},end:{x:u+16,y:H+16-v},thickness:.35,color:rgb(.83,.86,.89)})
      for(const stroke of data.strokes) {
        const [r,g,b]=stroke.color.slice(1).match(/../g).map(h=>parseInt(h,16)/255)
        page.drawSvgPath(inkPath(stroke),{x:16,y:H+16,color:rgb(r,g,b),opacity:stroke.tool==='highlight' ? .32 : 1})
      }
    }
  }
  return new Blob([await pdf.save()],{type:'application/pdf'})
}
