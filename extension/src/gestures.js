import { paintMark } from './annotations.js'

const clamp=v=>Math.min(1,Math.max(0,v))
export function bindGestures({viewer,getTool,getColor,add,note,editNote}) {
  const paper=document.getElementById('paper')
  let active=null
  function point(event) {
    const rect=paper.getBoundingClientRect()
    return [clamp((event.clientX-rect.left)/rect.width),clamp((event.clientY-rect.top)/rect.height)]
  }
  function area(a,b) {
    return [Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.abs(a[0]-b[0]),Math.abs(a[1]-b[1])]
  }
  function reset() {
    if(active?.preview) active.preview.remove()
    active=null
  }
  function move(event) {
    if(!active || event.pointerId!==active.pointer || active.textSelection) return
    const p=point(event), m=active.mark
    if(m.type==='draw') {
      const last=m.points.at(-1)
      if(Math.hypot((p[0]-last[0])*viewer.base.width,(p[1]-last[1])*viewer.base.height)<.5) return
      m.points.push(p)
    } else if(m.type==='highlight') m.rects=[area(active.start,p)]
    else return
    active.preview?.remove()
    active.preview=paintMark(m,viewer.base.width,viewer.base.height)
    document.getElementById('ink').append(active.preview)
  }
  paper.addEventListener('pointerdown',event=>{
    if(event.button!==0 || !event.isPrimary || paper.dataset.ready!=='true') return
    const type=getTool()
    if(type==='select') {
      const marker=event.target.closest('.note-marker')
      if(marker) editNote(marker.dataset.id)
      return
    }
    reset()
    const start=point(event)
    const mark={id:crypto.randomUUID(),page:viewer.page,type,color:getColor(),text:''}
    active={start,mark,pointer:event.pointerId,sequence:viewer.sequence}
    if(type==='highlight' && event.target.closest('.textLayer span:not(.markedContent)')) {
      window.getSelection().removeAllRanges()
      active.textSelection=true
      return
    }
    event.preventDefault()
    window.getSelection().removeAllRanges()
    if(type==='draw') { mark.points=[start]; mark.text='Freehand drawing' }
    if(type==='highlight') { mark.rects=[]; mark.text='Area highlight' }
    paper.setPointerCapture(event.pointerId)
  })
  paper.addEventListener('pointermove',move)
  window.addEventListener('pointerup',event=>{
    if(!active || event.pointerId!==active.pointer) return
    if(paper.dataset.ready!=='true' || active.sequence!==viewer.sequence) return reset()
    if(!active.textSelection) move(event)
    const {mark,start,textSelection}=active
    reset()
    if(textSelection) {
      // The browser finishes the selection in its pointerup default action.
      const sequence=viewer.sequence
      requestAnimationFrame(()=>{
        if(sequence!==viewer.sequence) return
        const selection=window.getSelection(), layer=document.getElementById('text-layer')
        if(!selection.rangeCount || selection.isCollapsed || !layer.contains(selection.anchorNode) || !layer.contains(selection.focusNode)) return
        const bounds=paper.getBoundingClientRect(), range=selection.getRangeAt(0)
        mark.text=selection.toString().trim()
        mark.rects=[...range.getClientRects()].filter(r=>r.width>1 && r.height>1).map(r=>
          area([clamp((r.left-bounds.left)/bounds.width),clamp((r.top-bounds.top)/bounds.height)],
               [clamp((r.right-bounds.left)/bounds.width),clamp((r.bottom-bounds.top)/bounds.height)]))
        selection.removeAllRanges()
        if(mark.text && mark.rects.length) add(mark)
      })
    } else if(mark.type==='note') {
      mark.point=[Math.min(start[0],Math.max(0,1-18/viewer.base.width)),Math.min(start[1],Math.max(0,1-18/viewer.base.height))]
      note(mark)
    } else if(mark.type==='draw') {
      if(mark.points.length===1) {
        const [x,y]=mark.points[0]
        mark.points.push([clamp(x+(x>.5?-.2:.2)/viewer.base.width),y])
      }
      add(mark)
    } else if(mark.rects[0][2]*viewer.base.width>=2 && mark.rects[0][3]*viewer.base.height>=2) add(mark)
  })
  paper.addEventListener('pointercancel',reset)
  window.addEventListener('blur',reset)
  return reset
}
