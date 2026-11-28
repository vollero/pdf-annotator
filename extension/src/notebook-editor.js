import {bindPenNavigation} from './pen-navigation.js'
import {blankPage,checkPage,inside,nextRef,pageHash,pageLimit} from './notebook-data.js'
import {inkPath,paperLines,W,H} from './notebook-ink.js'
const $=id=>document.getElementById('book-'+id)
const clamp=n=>Math.min(1,Math.max(0,n))
const svgNS='http://www.w3.org/2000/svg'
function svg(name,attrs) {
  const e=document.createElementNS(svgNS,name)
  for(const [k,v] of Object.entries(attrs)) e.setAttribute(k,v)
  return e
}
function trace(stroke,selected=false) {
  return svg('path',{d:inkPath(stroke),fill:selected?'#125cca':stroke.color,opacity:stroke.tool==='highlight'?.32:1})
}
function drawSheet(sheet,data) {
  sheet.replaceChildren(...paperLines(data.paper).map(([x1,y1,x2,y2])=>svg('line',{x1,y1,x2,y2,stroke:'#d0dce2','stroke-width':.55})),...data.strokes.map(s=>trace(s)))
}
export function bindNotebook({current,commit,flush,saveFile,editDetails,jump,notify}) {
  const dialog=$('dialog'),sheet=$('sheet')
  let doc,book,pageId,data,queue=Promise.resolve(),busy=false,active,clipboard=[],selected=new Set(),failure,sourceJob
  let histories=new Map(), epoch=0,zoom=1,readOnly=false
  const thumbs=new IntersectionObserver(entries=>{
    for(const {target,isIntersecting} of entries) if(isIntersecting) {
      thumbs.unobserve(target)
      const rev=target.dataset.rev
      Promise.resolve(doc?.books.get(rev)).then(async blob=>{
        if(blob && target.isConnected && target.dataset.rev===rev) drawSheet(target,JSON.parse(await blob.text()))
      }).catch(()=>{})
    }
  },{root:$('thumbs')})
  $('diagnostics').hidden=!globalThis.MarginAndroid
  $('diagnostics').onclick=()=>globalThis.MarginAndroid?.penReport()
  const live=()=>current().doc===doc && current().marks.find(m=>m.id===book?.id)
  const position=()=>book.notebook.findIndex(r=>r.id===pageId)
  function nav() {
    $('title').textContent=book.text
    $('position').textContent=(position()+1)+' / '+book.notebook.length
    $('index').value=position()+1; $('index').max=book.notebook.length
    $('paper').value=data.paper
    $('previous').disabled=position()<=0; $('next').disabled=position()===book.notebook.length-1
    $('undo').disabled=!histories.get(pageId)?.length
    $('thumbs').replaceChildren();thumbs.disconnect()
    if (!$('pages').open) return
    for (const [i,r] of book.notebook.entries()) {
      const b=document.createElement('button')
      const mini=svg('svg',{viewBox:'0 0 '+W+' '+H,'aria-hidden':true})
      mini.dataset.rev=r.rev;b.append(mini,String(i+1)+(r.conflict?' (conflict)':''));b.onclick=()=>action(()=>loadPage(r.id))
      $('thumbs').append(b);thumbs.observe(mini)
    }
  }
  $('pages').ontoggle=()=>{ if(dialog.open && data) nav() }
  async function store(page) {
    page={paper:page.paper,strokes:page.strokes}
    checkPage(page)
    const rev=await pageHash(page)
    await doc.books.putPage(rev,page)
    return rev
  }
  async function publish(refs) {
    const currentBook=live()
    if (!currentBook || !commit(doc,{...currentBook,notebook:refs})) throw Error('This notebook could not be saved.')
    await flush(doc)
    book={...currentBook,notebook:refs}
  }
  async function loadPage(id) {
    const r=book.notebook.find(r=>r.id===id)
    const blob=r && await doc.books.get(r.rev)
    if (!blob) throw Error('This notebook page is unavailable.')
    data=JSON.parse(await blob.text());pageId=id;selected.clear();active=null
    if(!readOnly && !doc.privateWindow) try {localStorage.setItem('margin.book.'+doc.file.id+'.'+book.id,id)} catch {}
    drawSheet(sheet,data);nav()
  }
  function action(fn) {
    if(busy || active) return
    busy=true
    return queue=queue.then(async()=>{
      if(failure) {notify('Retry the unsaved page first.');return}
      await fn()
    }).catch(e=>notify(e.message)).finally(()=>{busy=false})
  }
  function save(page) {
    const id=pageId
    $('status').textContent='Saving…'
    queue=queue.then(async()=>{
      const currentBook=live(),base=book.notebook.find(r=>r.id===id)
      if(!currentBook || !base) throw Error('Notebook changed before this page was saved.')
      const rev=await store(page),ref=nextRef(base,rev)
      const latest=live()
      if(!latest || latest.notebook.find(r=>r.id===id)?.rev!==base.rev) throw Error('This page changed in another window. Export the unsaved page before reopening.')
      await publish(latest.notebook.map(r=>r.id===id?ref:r))
      failure=null;$('status').classList.remove('error');$('status').textContent=doc.privateWindow?'In memory':'Page saved';nav()
    }).catch(e=>{failure=e;$('status').classList.add('error');$('status').textContent=e.message+' Use Retry or Save page PDF.'})
  }
  function replace(page,remember=true) {
    checkPage(page)
    if(remember) {
      const log=histories.get(pageId) ?? []
      log.push(data);if(log.length>24)log.shift();histories.set(pageId,log)
    }
    const append=page.paper===data.paper && !selected.size && page.strokes.length===data.strokes.length+1 && page.strokes.slice(0,-1).every((s,i)=>s===data.strokes[i])
    data=page;selected.clear()
    if(append)sheet.append(trace(page.strokes.at(-1)));else drawSheet(sheet,page)
    nav();save(page)
  }
  function paintSelection() {
    drawSheet(sheet,data)
    for(const s of data.strokes) if(selected.has(s.id)) sheet.append(trace(s,true))
  }
  function translate(strokes,dx,dy,copy) {
    for(const s of strokes) for(const p of s.points) {
      dx=Math.max(-p[0],Math.min(dx,1-p[0]));dy=Math.max(-p[1],Math.min(dy,1-p[1]))
    }
    return strokes.map(s=>({...s,id:copy?crypto.randomUUID():s.id,points:s.points.map(([x,y,p])=>[x+dx,y+dy,p])}))
  }
  function point(e) {
    const b=sheet.getBoundingClientRect()
    const round=n=>Math.round(clamp(n)*65535)/65535
    return [round((e.clientX-b.left)/b.width),round((e.clientY-b.top)/b.height),Math.round(clamp(e.pressure || .5)*255)/255]
  }
  function eraseAt(p) {
    for(const s of data.strokes) {
      let prev=s.points[0]
      for(const q of s.points) {
        const dx=q[0]-prev[0],dy=(q[1]-prev[1])*H/W,x=p[0]-prev[0],y=(p[1]-prev[1])*H/W
        const t=clamp((dx*x+dy*y)/(dx*dx+dy*dy || 1))
        if(Math.hypot(x-t*dx,y-t*dy)<.012+s.width/2) {active.erase.add(s.id);break}
        prev=q
      }
    }
  }
  sheet.onpointerdown=e=>{
    if(readOnly || !data || active || busy || failure || (e.pointerType==='touch' && !$('finger').checked)) return
    e.preventDefault();sheet.setPointerCapture(e.pointerId)
    const p=point(e),tool=$('tool').value
    active={pointer:e.pointerId,tool,start:p,path:[p],erase:new Set(),moving:false}
    if(tool==='lasso' && selected.size) active.moving=data.strokes.some(s=>selected.has(s.id) && s.points.some(q=>Math.hypot(q[0]-p[0],(q[1]-p[1])*H/W)<.04))
    if(tool==='eraser') eraseAt(p)
    if(tool==='pen' || tool==='highlight') {
      active.stroke={id:crypto.randomUUID(),tool,color:$('color').value,width:Number($('width').value)*(tool==='highlight'?5:1)/W,points:active.path}
      active.preview=trace(active.stroke);sheet.append(active.preview)
    } else if(tool==='lasso') {active.preview=svg('polyline',{fill:'none',stroke:'#1565c0','stroke-dasharray':'4 2'});sheet.append(active.preview)}
  }
  sheet.onpointermove=e=>{
    if(active?.pointer!==e.pointerId) return
    const samples=e.getCoalescedEvents?.() ?? []
    for(const ev of samples.length?samples:[e]) {
      const p=point(ev),prev=active.path.at(-1)
      if(Math.hypot((p[0]-prev[0])*W,(p[1]-prev[1])*H)<.4 || active.path.length>=20000)continue
      active.path.push(p)
      if(active.tool==='eraser') eraseAt(p)
    }
    if(active.stroke) active.preview.setAttribute('d',inkPath(active.stroke))
    else if(active.preview) active.preview.setAttribute('points',active.path.map(p=>p[0]*W+','+p[1]*H).join(' '))
  }
  sheet.onpointerup=e=>{
    if(active?.pointer!==e.pointerId) return
    const a=active;active=null;a.preview?.remove()
    try {
      if(a.stroke) replace({...data,strokes:[...data.strokes,a.stroke]})
      else if(a.tool==='eraser' && a.erase.size) replace({...data,strokes:data.strokes.filter(s=>!a.erase.has(s.id))})
      else if(a.moving) {
        const end=point(e), moved=translate(data.strokes.filter(s=>selected.has(s.id)),end[0]-a.start[0],end[1]-a.start[1],false)
        const byId=new Map(moved.map(s=>[s.id,s]))
        replace({...data,strokes:data.strokes.map(s=>byId.get(s.id)??s)})
      } else if(a.tool==='lasso') {selected=new Set(data.strokes.filter(s=>s.points.some(p=>inside(p,a.path))).map(s=>s.id));paintSelection()}
    } catch(error){notify(error.message);drawSheet(sheet,data)}
  }
  sheet.onpointercancel=sheet.onlostpointercapture=e=>{if(active?.pointer===e.pointerId){active.preview?.remove();active=null}}
  bindPenNavigation(sheet,sheet.parentElement,()=>readOnly || !$('finger').checked,step=>{
    zoom=Math.max(100,Math.min(300,zoom+step*20));$('zoom').value=zoom;sheet.style.width=zoom+'%'
  })
  $('finger').onchange=()=>sheet.classList.toggle('finger-ink',$('finger').checked)
  $('copy').onclick=()=>{clipboard=data.strokes.filter(s=>selected.has(s.id));$('status').textContent=clipboard.length+' strokes copied'}
  $('paste').onclick=()=>{if(clipboard.length)action(()=>replace({...data,strokes:[...data.strokes,...translate(clipboard,.018,.018,true)]}))}
  $('cut').onclick=()=>{if(selected.size)action(()=>replace({...data,strokes:data.strokes.filter(s=>!selected.has(s.id))}))}
  $('undo').onclick=()=>action(()=>{const prior=histories.get(pageId)?.pop();if(prior)replace(prior,false)})
  $('paper').onchange=()=>action(()=>replace({...data,paper:$('paper').value}))
  $('index').onchange=()=>action(()=>loadPage(book.notebook[Math.min(book.notebook.length-1,Math.max(0,Math.round(Number($('index').value)||1)-1))].id))
  for(const [name,dir] of [['previous',-1],['next',1]]) $(name).onclick=()=>action(()=>loadPage(book.notebook[position()+dir].id))
  $('page-action').onchange=()=>{
    const op=$('page-action').value;$('page-action').value=''
    action(async()=>{
      const refs=[...live().notebook],i=refs.findIndex(r=>r.id===pageId)
      if(i<0) throw Error('Page was removed.')
      let target=pageId
      if(op==='delete') {
        if(refs.length===1 || !confirm('Delete this notebook page? Workspace Undo can restore it.')) return
        refs.splice(i,1);target=refs[Math.min(i,refs.length-1)].id
      } else if(op==='up' || op==='down') {
        const j=i+(op==='up'?-1:1);if(j<0 || j>=refs.length)return
        ;[refs[i],refs[j]]=[refs[j],refs[i]]
      } else {
        if(refs.length>=pageLimit) throw Error('Notebook page limit reached.')
        const r=nextRef(null,op==='duplicate'?refs[i].rev:await store(blankPage(data.paper)))
        refs.splice(op==='append'?refs.length:op==='before'?i:i+1,0,r);target=r.id
      }
      await publish(refs);await loadPage(target)
    })
  }
  $('retry').onclick=()=>{if(failure)save(data)}
  async function print(books,getBlob=doc.books.get) {
    const {printNotebooks}=await import('./notebook-pdf.js')
    await saveFile(await printNotebooks(books,doc.file.name,getBlob),books[0].text.slice(0,60).replace(/[^\p{L}\p{N} -]/gu,'_')+'-notes.pdf')
  }
  $('print-page').onclick=()=>print([{...book,notebook:[{rev:'current'}]}],()=>new Blob([JSON.stringify(data)])).catch(e=>notify(e.message))
  $('print').onclick=()=>action(async()=>{
    const ids=new Set([...$('exports').selectedOptions].map(o=>o.value));const list=(readOnly?[book]:current().marks).filter(m=>ids.has(m.id) && m.notebook)
    if(list.length)await print(list)
  })
  $('close').onclick=()=>{if(failure){if(confirm('Discard unsaved handwriting on this page?'))dialog.close()}else action(()=>dialog.close())}
  $('source').onclick=()=>action(()=>{dialog.close();jump(book,book.passages?.[0]??book)})
  $('details').onclick=()=>action(()=>{dialog.close();editDetails(book)})
  dialog.oncancel=e=>{e.preventDefault();$('close').click()}
  dialog.onclose=()=>{if(globalThis.MarginAndroid && !readOnly)try {localStorage.removeItem('margin.open-notebook.'+doc.file.id)}catch{}
    epoch++;sourceJob?.cancel();thumbs.disconnect();data=null;active=null;clipboard=[]}
  $('split').oninput=()=>dialog.style.setProperty('--source-width',$('split').value+'%')
  $('zoom').oninput=()=>{zoom=Number($('zoom').value);sheet.style.width=zoom+'%'}
  async function open(mark,historical=false) {
    if(dialog.open)return
    const token=++epoch
    readOnly=historical;dialog.classList.toggle('historical',historical)
    doc=current().doc;book=mark;histories=new Map();failure=null;clipboard=[]
    if(!book.notebook) {const rev=await store(blankPage());await publish([nextRef(null,rev)])}
    if(token!==epoch || doc!==current().doc || (!readOnly && !live()))return
    let last
    if(!readOnly && !doc.privateWindow)try{last=localStorage.getItem('margin.book.'+doc.file.id+'.'+book.id)}catch{}
    await loadPage(book.notebook.find(r=>r.id===last)?.id ?? book.notebook[0].id)
    if(token!==epoch || doc!==current().doc || (!readOnly && !live()))return
    $('exports').replaceChildren(...(readOnly?[book]:current().marks).filter(m=>m.notebook).map(m=>new Option(m.text,m.id,false,m.id===book.id)))
    $('status').classList.remove('error');$('status').textContent=readOnly?'Recorded draft · read only':'';dialog.showModal()
    if(globalThis.MarginAndroid && !readOnly)try {localStorage.setItem('margin.open-notebook.'+doc.file.id,book.id)}catch{}
    const pdfPage=await current().pdf.getPage(book.page)
    if(token!==epoch || !dialog.open)return
    const viewport=pdfPage.getViewport({scale:1.2}),canvas=$('reference');canvas.width=viewport.width;canvas.height=viewport.height
    const ctx=canvas.getContext('2d')
    sourceJob=pdfPage.render({canvasContext:ctx,viewport})
    await sourceJob.promise
    const rects=book.passages?.[0].rects ?? [[...book.point,...(book.size??[.025,.025])]]
    ctx.fillStyle='#d9952444';for(const [x,y,w,h] of rects)ctx.fillRect(x*canvas.width,y*canvas.height,w*canvas.width,h*canvas.height)
  }
  return (mark,historical)=>open(mark,historical).catch(e=>{if(e.name!=='RenderingCancelledException')notify(e.message)})
}
