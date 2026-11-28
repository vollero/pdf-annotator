// In ink mode route fingers to the viewport and reserve stylus events for ink.
// A second finger changes zoom. Contact during a pen stroke is ignored until lift.
export function bindPenNavigation(surface,scroller,enabled,zoom) {
  const fingers=new Map()
  let pen=null,distance=0
  const span=()=>{const [a,b]=[...fingers.values()];return Math.hypot(a.x-b.x,a.y-b.y)}
  surface.addEventListener('pointerdown',e=>{
    if(!enabled())return
    if(e.pointerType==='pen') {pen=e.pointerId;for(const f of fingers.values())f.ignored=true;return}
    if(e.pointerType!=='touch')return
    fingers.set(e.pointerId,{x:e.clientX,y:e.clientY,ignored:pen!==null})
    surface.setPointerCapture(e.pointerId)
    if(fingers.size===2) distance=span()
    e.preventDefault();e.stopImmediatePropagation()
  },true)
  surface.addEventListener('pointermove',e=>{
    const f=fingers.get(e.pointerId)
    if(!f)return
    const dx=f.x-e.clientX,dy=f.y-e.clientY
    f.x=e.clientX;f.y=e.clientY
    if(pen===null && ![...fingers.values()].some(p=>p.ignored)) {
      if(fingers.size===1)scroller.scrollBy(dx,dy)
      if(fingers.size===2) {const d=span();if(distance && (d/distance>1.16 || d/distance<.86)){zoom(d>distance?1:-1);distance=d}}
    }
    e.preventDefault();e.stopImmediatePropagation()
  },true)
  function end(e) {
    if(e.pointerId===pen)pen=null
    if(fingers.delete(e.pointerId)){e.preventDefault();e.stopImmediatePropagation()}
  }
  for(const event of ['pointerup','pointercancel','lostpointercapture'])surface.addEventListener(event,end,true)
}
