// Bind only button masks delivered by this device. System-reserved shortcuts
// never reach a PointerEvent and are left to Android.
export function notebookPen(sheet, controls, privateWindow) {
  const bindings=new Map()
  let events=0, batches=0, hover=0, tilt=0, low=1, high=0
  function observe(event) {
    if(event.pointerType!=='pen')return
    events++
    batches+=event.getCoalescedEvents?.().length ?? 0
    if(event.pressure>0){low=Math.min(low,event.pressure);high=Math.max(high,event.pressure)}
    else if(event.type==='pointermove')hover++
    tilt=Math.max(tilt,Math.abs(event.tiltX),Math.abs(event.tiltY))
    const mask=event.buttons & ~1
    if(!mask || bindings.has(mask))return
    const key='margin.notebook-button.'+mask
    const label=document.createElement('label'),select=document.createElement('select')
    label.append('Pen button '+mask+' ',select)
    for(const [value,name] of [['','Selected tool'],['eraser','Stroke eraser'],['highlight','Highlighter'],['lasso','Lasso']])select.add(new Option(name,value))
    if(!privateWindow)try{select.value=localStorage.getItem(key) || ''}catch{}
    select.onchange=()=>{if(!privateWindow)try{localStorage.setItem(key,select.value)}catch{}}
    controls.hidden=false;controls.append(label);bindings.set(mask,select)
  }
  for(const type of ['pointerdown','pointermove','pointerup'])sheet.addEventListener(type,observe,true)
  sheet.addEventListener('contextmenu',e=>{if(e.pointerType==='pen')e.preventDefault()})
  return {
    tool:e=>e.pointerType==='pen' && bindings.get(e.buttons & ~1)?.value,
    report:()=>['Editor pen events: '+events,'Coalesced samples: '+batches,'Hover events: '+hover,
      'Largest tilt (degrees): '+tilt,'Pressure: '+(high?low.toFixed(2)+' to '+high.toFixed(2):'—'),
      'Button masks: '+([...bindings.keys()].join(', ') || 'none observed')].join('\n')
  }
}
