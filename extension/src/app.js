import { decorate } from './icons.js'
import { colors,anchor } from './annotations.js'
import { Viewer,readPDF } from './viewer.js'
import { bindGestures } from './gestures.js'
import { renderCards,closeCardMenus } from './sidebar.js'
import { lastDocument,remember,readMarks,writeChanges } from './storage.js'

const $=id=>document.getElementById(id)
decorate()
let session, marks=[], undo=[], redo=[], selected=null, tool='select', color=colors[0][1]
let opening=0, editNumber=0, writes=Promise.resolve(), noteDraft, toastTimer, exporting=false
const channel=new BroadcastChannel('margin-draft-changes')

function toast(message) {
  clearTimeout(toastTimer)
  $('toast').textContent=message
  $('toast').hidden=false
  toastTimer=setTimeout(()=>{ $('toast').hidden=true },6500)
}
function state(label,kind='saved') {
  $('save-state').lastElementChild.textContent=label
  $('save-state').dataset.state=kind
}
function cards() {
  renderCards({marks,page:viewer.page,currentOnly:$('filter').value==='current',selected,
    jump:jumpTo,edit:openNote,remove:mark=>change(marks.filter(m=>m.id!==mark.id))})
}
const viewer=new Viewer({onPage:cards,onError:toast})
const cancelGesture=bindGestures({
  viewer,getTool:()=>tool,getColor:()=>color,
  add:added=>{ selected=added[0].id; change([...marks,...added]) },
  note:openNote,editNote:id=>openNote(marks.find(m=>m.id===id))
})
function refresh() {
  $('undo').disabled=!undo.length; $('redo').disabled=!redo.length
  viewer.setMarks(marks)
  cards()
}
function persist(next) {
  const doc=session, number=++editNumber
  state('Saving…','pending')
  writes=writes.then(async()=>{
    try {
      if(!doc.remembered) {
        await remember(doc.file,doc.saved)
        doc.remembered=true
      }
      await writeChanges(doc.file.id,doc.saved,next)
      doc.saved=next
      channel.postMessage(doc.file.id)
      if(doc===session && number===editNumber) state('Saved locally')
    } catch {
      if(doc===session) {
        state('Local save failed','error')
        toast('Local storage is unavailable. Export your PDF to keep these changes.')
      }
    }
  })
}
function apply(next) {
  marks=next
  if(!marks.some(m=>m.id===selected)) selected=null
  refresh()
  persist(next)
}
function change(next) {
  if(!session) return
  undo.push(marks)
  if(undo.length>100) undo.shift()
  redo=[]
  apply(next)
}
function historyMove(from,to) {
  if(!from.length) return
  to.push(marks)
  apply(from.pop())
}
channel.onmessage=async event=>{
  const doc=session
  if(!doc || event.data!==doc.file.id) return
  await writes
  const number=editNumber
  try {
    const merged=await readMarks(doc.file.id)
    if(doc===session && number===editNumber && merged && JSON.stringify(merged)!==JSON.stringify(marks)) {
      undo=[];redo=[];doc.saved=marks=merged;refresh()
    }
  } catch { /* Leave the current in-memory document editable. */ }
}

function selectTool(value) {
  tool=value;cancelGesture();window.getSelection().removeAllRanges()
  $('sheets').dataset.tool=value
  document.querySelectorAll('button[data-tool]').forEach(button=>{
    const active=button.dataset.tool===value
    button.classList.toggle('active',active)
    button.setAttribute('aria-pressed',active)
  })
}
for(const button of document.querySelectorAll('button[data-tool]')) button.onclick=()=>selectTool(button.dataset.tool)
for(const [label,value] of colors) {
  const button=document.createElement('button')
  button.className='swatch';button.title=label
  button.style.setProperty('--tone',value);button.setAttribute('aria-label',label+' annotation color')
  button.setAttribute('aria-pressed',color===value)
  button.onclick=()=>{
    color=value
    for(const b of button.parentNode.children) b.setAttribute('aria-pressed',b===button)
  }
  document.querySelector('.palette').append(button)
}

async function jumpTo(mark) {
  selected=mark.id
  const sheet = viewer.sheets[mark.page - 1]
  if (viewer.page !== mark.page || sheet.element.dataset.ready !== 'true') await viewer.go(mark.page)
  if (!sheet.element.isConnected || selected !== mark.id) return
  cards()
  const [x,y]=anchor(mark), paper=sheet.element, scroller=$('scroller')
  const br=paper.getBoundingClientRect(),sr=scroller.getBoundingClientRect()
  const dx=br.left+x*br.width-sr.left,dy=br.top+y*br.height-sr.top
  if(dy<15 || dy>sr.height-75) scroller.scrollTop+=dy-sr.height*.4
  if(dx<0 || dx>sr.width-25) scroller.scrollLeft+=dx-sr.width*.5
}
function openNote(mark) {
  if(!mark || !session) return
  noteDraft={mark,session}
  $('note-title').textContent=marks.some(m=>m.id===mark.id)?'Edit note':'Add a note'
  $('note-text').value=mark.text
  $('note-dialog').showModal()
  $('note-text').focus()
}
$('note-form').addEventListener('submit',e=>{
  e.preventDefault()
  const text=$('note-text').value.trim()
  if(!text) { $('note-text').focus();return }
  if(noteDraft?.session===session) {
    const mark={...noteDraft.mark,text}
    selected=mark.id
    change(marks.some(m=>m.id===mark.id)?marks.map(m=>m.id===mark.id?mark:m):[...marks,mark])
  }
  $('note-dialog').close()
})
$('note-dialog').onclose=()=>{noteDraft=null}
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close())
document.addEventListener('click',e=>{ if(!e.target.closest('.more,.card-menu')) closeCardMenus() })

async function digest(bytes) {
  const d=await crypto.subtle.digest('SHA-256',bytes)
  return [...new Uint8Array(d)].map(n=>n.toString(16).padStart(2,'0')).join('')
}
async function load(file,initial=[],ticket=++opening) {
  if(ticket!==opening) return
  let pdf
  try {
    file.id??=await digest(file.bytes)
    let base=file.bytes
    pdf=await readPDF(base)
    const metadata=await pdf.getMetadata()
    if(metadata.info.Custom?.MarginEditor==='1') {
      const {unpack}=await import('./pdf-annotations.js')
      const restored=await unpack(base)
      await pdf.destroy()
      base=restored.bytes; initial=restored.marks
      pdf=await readPDF(base)
    }
    if(ticket!==opening) {await pdf.destroy();return}
    await writes
    if(ticket!==opening) {await pdf.destroy();return}
    let saved=initial,remembered=false
    try { saved=await remember(file,initial);remembered=true } catch { /* A storage failure still permits export. */ }
    if(ticket!==opening) {await pdf.destroy();return}
    selected=null;undo=[];redo=[];marks=saved
    session={file,base,saved,remembered}
    $('filename').textContent=file.name
    $('filename').title=file.name
    document.title=file.name+' · Margin'
    state(remembered?'Saved locally':'Local save failed',remembered?'saved':'error')
    if(!remembered) toast('Local storage is unavailable. Export your PDF to keep your work.')
    $('export').disabled=exporting
    $('filter').value='all'
    viewer.setDocument(pdf,marks)
    selectTool('select');refresh()
    return true
  } catch(error) {
    if(pdf && pdf!==viewer.pdf) await pdf.destroy().catch(()=>{})
    if(ticket===opening) {
      const locked=error.name==='PasswordException' || error.message?.includes('encrypted')
      toast(locked?'Open an unlocked copy of this PDF to annotate it.':'This file could not be opened as a PDF.')
      if(!session) state('Open a PDF to begin','error')
    }
    return false
  }
}
async function openFile(file) {
  if(!file) return
  const ticket=++opening
  try { await load({bytes:new Uint8Array(await file.arrayBuffer()),name:file.name},[],ticket) }
  catch { toast('The selected file could not be read.') }
}
$('open').onclick=()=>$('file').click()
$('file').onchange=()=>{openFile($('file').files[0]);$('file').value=''}
let dragDepth=0
document.addEventListener('dragenter',e=>{if(e.dataTransfer.types.includes('Files')) {e.preventDefault();dragDepth++;document.body.classList.add('dragging')}})
document.addEventListener('dragleave',()=>{if(--dragDepth<=0) {dragDepth=0;document.body.classList.remove('dragging')}})
document.addEventListener('dragover',e=>{if(e.dataTransfer.types.includes('Files')) e.preventDefault()})
document.addEventListener('drop',e=>{
  e.preventDefault();dragDepth=0;document.body.classList.remove('dragging')
  if(e.dataTransfer.files.length) openFile(e.dataTransfer.files[0])
})

async function download() {
  if(!session || exporting) return
  exporting=true;$('export').disabled=true
  const {file,base}=session, pdf=viewer.pdf, snapshot=marks
  try {
    const {exportDocument}=await import('./pdf-annotations.js')
    const bytes=await exportDocument(base,snapshot,async number=>(await pdf.getPage(number)).getViewport({scale:1}))
    const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}))
    const link=document.createElement('a')
    link.href=url;link.download=file.name.replace(/(?:-annotated)?\.pdf$/i,'')+'-annotated.pdf'
    document.body.append(link);link.click();link.remove()
    setTimeout(()=>URL.revokeObjectURL(url),60000)
  } catch {toast('This PDF could not be exported. Try an unlocked copy of the original file.')}
  finally {exporting=false;$('export').disabled=!session}
}
$('export').onclick=download
$('undo').onclick=()=>historyMove(undo,redo)
$('redo').onclick=()=>historyMove(redo,undo)
$('prev').onclick=()=>viewer.go(viewer.page-1)
$('next').onclick=()=>viewer.go(viewer.page+1)
$('thumbnails').onclick=e=>{const button=e.target.closest('.thumbnail');if(button)viewer.go(+button.dataset.page)}
$('zoom-in').onclick=()=>viewer.changeZoom(1)
$('zoom-out').onclick=()=>viewer.changeZoom(-1)
$('fit').onclick=()=>viewer.changeZoom(0)
$('filter').onchange=cards
function panel(name,visible) {
  $(name+'-panel').hidden=!visible
  $(name+'-toggle').setAttribute('aria-expanded',visible)
}
for(const name of ['pages','annotations']) {
  $(name+'-toggle').onclick=()=>panel(name,$(name+'-panel').hidden)
}
panel('pages',innerWidth>650)
panel('annotations',innerWidth>850)

// These two preferences affect the viewer across documents in this browser profile.
function preference(key, fallback) {
  try { return localStorage.getItem('margin.' + key) ?? fallback }
  catch { return fallback }
}
function savePreference(key, value) {
  try { localStorage.setItem('margin.' + key, value) }
  catch { /* The view controls also work when browser storage is unavailable. */ }
}
function showWorkspace(visible) {
  cancelGesture()
  closeCardMenus()
  viewer.preservePosition(() => document.body.classList.toggle('pdf-only', !visible))
  viewer.redrawVisible()
  const toggle = $('workspace-toggle')
  toggle.setAttribute('aria-expanded', String(visible))
  toggle.querySelector('span').textContent = visible ? 'Hide workspace' : 'Show workspace'
}
function toggleWorkspace() {
  const show = document.body.classList.contains('pdf-only')
  showWorkspace(show)
  savePreference('workspace', show ? 'shown' : 'hidden')
}
$('workspace-toggle').onclick = toggleWorkspace
showWorkspace(preference('workspace', 'shown') !== 'hidden')
$('page-layout').value = preference('layout', 'single') === 'continuous' ? 'continuous' : 'single'
viewer.setLayout($('page-layout').value)
$('page-layout').onchange = () => {
  cancelGesture()
  viewer.setLayout($('page-layout').value)
  savePreference('layout', $('page-layout').value)
  $('scroller').focus({preventScroll: true})
}

const mod=navigator.platform.includes('Mac')?'⌘':'Ctrl'
for(const [action,key] of [['Select','V'],['Highlight','H'],['Draw','D'],['Note','N'],['Show / hide workspace','W'],['Zoom in / out','+ / −'],['Fit to width','0'],['Previous / next page','← / →'],['Undo',mod+' + Z'],['Redo',mod+' + Shift + Z'],['Open PDF',mod+' + O'],['Export PDF',mod+' + S']]) {
  const dt=document.createElement('dt'), dd=document.createElement('dd')
  dt.textContent=action;dd.textContent=key;$('key-list').append(dt,dd)
}
$('shortcuts').onclick=()=>$('keys-dialog').showModal()
document.addEventListener('keydown',e=>{
  if(document.querySelector('dialog[open]') || e.target.closest('textarea,input,select,[contenteditable="true"]')) return
  const key=e.key.toLowerCase(), ctrl=e.ctrlKey||e.metaKey
  if(e.altKey) return
  if(ctrl) {
    if(key==='z') {e.preventDefault();(e.shiftKey?$('redo'):$('undo')).click()}
    if(key==='y') {e.preventDefault();$('redo').click()}
    if(key==='o') {e.preventDefault();$('open').click()}
    if(key==='s') {e.preventDefault();download()}
    return
  }
  if (key === 'w' && !e.repeat) { e.preventDefault(); toggleWorkspace(); return }
  if (key === 'escape' && document.body.classList.contains('pdf-only')) {
    toggleWorkspace()
    $('workspace-toggle').focus()
    return
  }
  if (['+', '=', '-', '0'].includes(key)) {
    e.preventDefault()
    viewer.changeZoom(key === '0' ? 0 : key === '-' ? -1 : 1)
    return
  }
  const toolKeys={v:'select',h:'highlight',d:'draw',n:'note'}
  if(toolKeys[key]) selectTool(toolKeys[key])
  if(key==='arrowleft' || key==='arrowright') {e.preventDefault();viewer.go(viewer.page+(key==='arrowright'?1:-1))}
  if(key==='escape') {closeCardMenus();selectTool('select')}
})

async function start() {
  const ticket=++opening
  const source=new URLSearchParams(location.hash.slice(1)).get('source')
  let sourceError
  if(source) {
    history.replaceState(null,'',location.pathname)
    try {
      const url=new URL(source)
      if(!['http:','https:','file:'].includes(url.protocol)) throw Error()
      const response=await fetch(url,{credentials:'include'})
      if(!response.ok && url.protocol!=='file:') throw Error()
      let name=url.pathname.split('/').pop() || 'Document.pdf'
      try {name=decodeURIComponent(name)} catch { /* Preserve the original filename. */ }
      if(await load({name,bytes:new Uint8Array(await response.arrayBuffer())},[],ticket)) return
      sourceError='Use Open PDF to choose an unlocked copy of this document.'
    } catch {sourceError='This tab’s PDF could not be read. Use Open PDF to choose a local copy.'}
  }
  try {
    const last=await lastDocument().catch(()=>null)
    if(!last || !await load(last,[],ticket)) {
      const [pdf,annotations]=await Promise.all([fetch('assets/reading-the-alps.pdf'),fetch('assets/sample-annotations.json')])
      await load({bytes:new Uint8Array(await pdf.arrayBuffer()),name:'Reading the Alps.pdf'},await annotations.json(),ticket)
    }
    if(sourceError && ticket===opening) toast(sourceError)
  } catch {if(ticket===opening) {state('Open a PDF to begin','error');toast('Choose a PDF to open your workspace.')}}
}
start()
