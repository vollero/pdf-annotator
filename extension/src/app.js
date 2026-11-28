import { bindTimeline } from './timeline.js'
import { dateEdits, dateLine } from './annotation-dates.js'
import { checkFileSize, DocumentLimitError, readResponse } from './input.js'
import { checkMarkBudget, compatibleMarkTypes, convertPageNote, isNote, readDraft, quotedText } from './mark-data.js'
import { exportAnnotations, mergeAnnotations } from './annotation-file.js'
import { runPdfJob } from './pdf-job.js'
import { decorate } from './icons.js'
import { anchor,populateMarkupPicker } from './annotations.js'
import { bindPalette } from './palette.js'
import { markupLabels, withMarkupStyle } from './markup.js'
import { Viewer,readPDF } from './viewer.js'
import { bindGestures } from './gestures.js'
import { bindNotePreview } from './note-preview.js'
import { openDiscussion } from './discussion-editor.js'
import { renderNoteText } from './note-format.js'
import { renderCards,closeCardMenus } from './sidebar.js'
import { lastDocument,remember,readWorkspace,writeChanges,recoverySummary,restorePrevious } from './storage.js'
import { addNamedSet, archiveSet, assignSet, defaultSet, exportSetMarks, importNamedSets, initialSets, renameSet, setLabel, setNames, setView, visibleMarks } from './annotation-sets.js'
import { bindSetControls } from './set-controls.js'
import { mergeTags, parseTags, validAuthor } from './comment-details.js'

const $=id=>document.getElementById(id)
decorate()
let session, marks=[], undo=[], redo=[], selected=null, tool='select'
let sets = initialSets
let activeImport = new AbortController()
function beginImport() {
  activeImport.abort()
  activeImport = new AbortController()
  return ++opening
}
let opening=0, editNumber=0, writes=Promise.resolve(), noteDraft, toastTimer, exporting=false
const privateWindow = chrome.extension.inIncognitoContext
let privateAuthor = ''
const privateStatus = 'Private session · export to keep'
const {getColor, chooseAnnotationColor} = bindPalette({privateWindow, preference, savePreference, notify:toast})
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
  if ($('timeline-dialog').open) return
  renderCards({marks:viewer.marks,sets,page:viewer.page,currentOnly:$('filter').value==='current',selected,
    moveToSet:(mark,name)=>change(marks.map(item=>item.id===mark.id ? assignSet(item,name) : item)),
    jump:jumpTo,edit:openNote,convert:convertNote,notePreview,recolor,remove:mark=>change(marks.filter(m=>m.id!==mark.id)),
    setDone:(mark, done)=>change(marks.map(m=>m.id===mark.id ? {...m,done} : m)),
    setStyle:(mark, style)=>change(marks.map(m=>m.id===mark.id ? withMarkupStyle(m,style) : m))})
}
async function convertNote(mark) {
  const doc = session
  let view = viewer.sheets[mark.page-1]?.base
  if (!view) {
    // A card can belong to a page that has never been displayed.
    try { view = (await viewer.pdf.getPage(mark.page)).getViewport({scale:1}) }
    catch { if (session===doc) toast('Could not read the PDF page dimensions.'); return }
  }
  if (session!==doc) return
  const current = marks.find(m=>m.id===mark.id)
  if (current?.type!==mark.type || current.page!==mark.page) return
  if (!current.text.trim()) { toast('Edit the note and add text before converting it to a region.'); return }
  const converted = convertPageNote(current,view.width,view.height)
  selected = current.id
  if (change(marks.map(m=>m===current ? converted : m))) {
    toast(converted.type==='region' ? 'Converted to a region note.' : 'Converted to a point note.')
  }
}
async function recolor(mark) {
  const doc = session
  const color = await chooseAnnotationColor(mark.color)
  if (!color || session!==doc || color===mark.color.toLowerCase()) return
  const current = marks.find(m=>m.id===mark.id)
  if (!compatibleMarkTypes(current,mark)) { toast('This annotation is no longer in the document.'); return }
  if (color!==current.color.toLowerCase()) change(marks.map(m=>m===current ? {...m,color} : m))
}
const viewer=new Viewer({onPage:cards,onError:toast,onEditNote:openNote})
const notePreview = bindNotePreview($('sheets'), $('note-preview'), id => viewer.marks.find(mark => mark.id === id), openNote)
const cancelGesture=bindGestures({
  viewer,getTool:()=>tool,getColor,getStyle:()=>$('tool-style').value,
  add:added=>{
    selected=added[0].id
    change([...marks,...added.map(mark=>assignSet(mark,sets.active))],toast,revealSet(sets.active))
  },
  note:openNote,hideNotePreview:notePreview.hideHover,notify:toast,
  setNoteBox:(id,point,size)=>{
    selected=id
    change(marks.map(m=>{
      if (m.id!==id) return m
      const updated = {...m,point}
      if (size) updated.size = size
      else delete updated.size
      return updated
    }))
  }
})
function revealSet(name) {
  if (sets.archived?.includes(name)) return sets
  if (name !== defaultSet && !sets.names.includes(name)) return {...sets,names:[...sets.names,name]}
  return sets.hidden.includes(name) ? {...sets,hidden:sets.hidden.filter(item=>item!==name)} : sets
}
function updateSetView(next) {
  cancelGesture()
  sets = next
  refresh()
  persist(marks,sets)
}
const renderSets = bindSetControls({
  create(label) {
    const {key,view} = addNamedSet(sets,label)
    change(marks,message=>{throw new Error(message)},{...view,active:key})
  },
  rename(key,label) {
    const next = renameSet(sets,key,label)
    if (next!==sets) change(marks,message=>{throw new Error(message)},next)
  },
  archive(key,value) {
    const next = archiveSet(sets,key,value)
    if (next!==sets) change(marks,toast,next)
  },
  writeIn(name) { updateSetView({...revealSet(name),active:name}) },
  showSet(name,show) {
    updateSetView(show ? revealSet(name) : {...sets,hidden:[...sets.hidden,name]})
  }
})
const timeline=bindTimeline({
  current:()=>({doc:session,marks,sets,page:viewer.page,selected,left:$('scroller').scrollLeft,top:$('scroller').scrollTop}),
  flush:()=>writes,privateWindow,notify:toast,
  preview(shown,mark) {
    cancelGesture()
    notePreview.clear()
    viewer.setMarks(shown)
    cards()
    if (mark) jumpTo(mark,mark.passages?.[0] ?? mark)
  },
  returnToDraft(state) {
    selected=state.selected
    refresh()
    viewer.go(state.page)
    $('scroller').scrollTo(state.left,state.top)
  }
})
function refresh() {
  const visible = visibleMarks(marks,sets)
  if (selected && !visible.some(mark=>mark.id===selected)) selected=null
  if (!timeline.active) viewer.setMarks(visible)
  notePreview.refresh()
  $('undo').disabled=!undo.length; $('redo').disabled=!redo.length
  renderSets(sets,marks)
  $('export').title = sets.hidden.length || sets.archived?.length ? 'Export PDF with visible annotation sets only' : 'Export annotated PDF'
  cards()
}
function persist(next,nextSets) {
  if (privateWindow) { state(privateStatus); return }
  const doc=session, number=++editNumber
  state('Saving…','pending')
  writes=writes.then(async()=>{
    try {
      if(!doc.remembered) {
        await remember(doc.file,doc.saved)
        doc.remembered=true
      }
      const {savedSets,concurrent} = await writeChanges(doc.file.id,doc.saved,next,doc.savedSets,nextSets)
      doc.saved=next;doc.savedSets=nextSets
      channel.postMessage(doc.file.id)
      if(doc===session && number===editNumber) {
        state('Saved locally')
        if (concurrent) {
          await syncStored(doc,number)
          if (doc===session && number===editNumber && nextSets.names.some(key=>setLabel(savedSets,key)!==setLabel(nextSets,key))) {
            toast('Another tab changed the annotation sets. The saved names are now shown.')
          }
        }
      }
    } catch {
      if(doc===session) {
        state('Local save failed','error')
        toast('Local storage is unavailable. Export your PDF to keep these changes.')
      }
    }
  })
}
function apply(next,nextSets) {
  marks=next;sets=nextSets
  refresh()
  persist(next,nextSets)
}
function change(next,onError=toast,nextSets=sets,localEdit=true) {
  if(!session) return false
  try {
    if (localEdit) next = dateEdits(marks,next)
    checkMarkBudget(next)
    if (nextSets !== sets) nextSets = setView(setNames(nextSets.names,next),nextSets)
  } catch (error) { onError(error.message); return false }
  undo.push({marks,sets})
  if(undo.length>100) undo.shift()
  redo=[]
  apply(next,nextSets)
  return true
}
function historyMove(from,to) {
  if(!from.length) return
  to.push({marks,sets})
  const prior = from.pop()
  const hidden = new Set(sets.hidden)
  let active = sets.active
  for (const key of prior.sets.names) {
    if (!!sets.archived?.includes(key) === !!prior.sets.archived?.includes(key)) continue
    if (prior.sets.hidden.includes(key)) hidden.add(key)
    else hidden.delete(key)
    if (active===defaultSet && prior.sets.active===key) active=key
  }
  apply(prior.marks,setView(prior.sets.names,{...prior.sets,active,hidden:[...hidden]}))
}
async function syncStored(doc,number) {
  try {
    const stored=await readWorkspace(doc.file.id)
    if (doc!==session || number!==editNumber || !stored.marks) return
    const merged=readDraft(stored.marks,doc.pages)
    const mergedSets=setView(setNames(stored.sets.names,merged),stored.sets)
    const documentChanged = JSON.stringify(merged)!==JSON.stringify(readDraft(marks,doc.pages)) || JSON.stringify(mergedSets.names)!==JSON.stringify(sets.names) ||
      JSON.stringify(mergedSets.labels)!==JSON.stringify(sets.labels) || JSON.stringify(mergedSets.archived)!==JSON.stringify(sets.archived)
    if (documentChanged || JSON.stringify(mergedSets)!==JSON.stringify(sets)) {
      if (documentChanged) { undo=[];redo=[];doc.saved=marks=merged }
      doc.savedSets=sets=mergedSets
      refresh()
    }
  } catch { /* Leave the current in-memory document editable. */ }
}
channel.onmessage=async event=>{
  const doc=session
  if(privateWindow || !doc || event.data!==doc.file.id) return
  await writes
  await syncStored(doc,editNumber)
}

let recovery
$('restore-draft').onclick=async()=>{
  const doc=session
  if (!doc || privateWindow) return
  await writes
  try {
    const copy = await recoverySummary(doc.file.id)
    if (doc!==session) return
    if (!copy) { toast('A recovery copy will be available after your first saved change.'); return }
    recovery={doc,token:copy.token}
    $('recovery-summary').textContent = 'Restore the draft with '+copy.count+(copy.count===1 ? ' annotation' : ' annotations')+
      ' replaced on '+new Date(copy.at).toLocaleString()+'? Its annotation sets will also be restored.'
    $('recovery-dialog').showModal()
  } catch { toast('Could not read the local recovery copy.') }
}
$('confirm-restore').onclick=()=>{
  if (!recovery || recovery.doc!==session) return
  const {doc,token}=recovery
  recovery=null
  const button=$('confirm-restore')
  button.disabled=true
  writes=writes.then(async()=>{
    try {
      if (doc!==session) return
      await restorePrevious(doc.file.id,token)
      channel.postMessage(doc.file.id)
      await syncStored(doc,editNumber)
      if (doc===session) { state('Saved locally'); toast('Previous draft restored.') }
    } catch (error) { toast(error?.message || 'Could not restore the previous draft.') }
    finally { button.disabled=false; $('recovery-dialog').close() }
  })
}

function selectTool(value) {
  notePreview.hideHover()
  tool=value;cancelGesture();window.getSelection().removeAllRanges()
  $('sheets').dataset.tool=value
  document.querySelectorAll('button[data-tool]').forEach(button=>{
    const active=button.dataset.tool===value
    button.classList.toggle('active',active)
    button.setAttribute('aria-pressed',active)
  })
}
for(const button of document.querySelectorAll('button[data-tool]')) button.onclick=()=>selectTool(button.dataset.tool)
for (const picker of [$('tool-style'),$('selection-style')]) {
  populateMarkupPicker(picker)
  picker.onchange = () => {
    const style = picker.value
    $('tool-style').value = $('selection-style').value = style
    $('tool-style-name').textContent = $('selection-style-name').textContent = markupLabels[style]
    if (picker === $('tool-style')) selectTool('highlight')
  }
}

async function jumpTo(mark,part=mark) {
  selected=mark.id
  const sheet = viewer.sheets[part.page - 1]
  if (viewer.page !== part.page || sheet.element.dataset.ready !== 'true') await viewer.go(part.page)
  if (!sheet.element.isConnected || selected !== mark.id) return
  cards()
  const [x,y]=anchor(part), paper=sheet.element, scroller=$('scroller')
  const br=paper.getBoundingClientRect(),sr=scroller.getBoundingClientRect()
  const dx=br.left+x*br.width-sr.left,dy=br.top+y*br.height-sr.top
  if(dy<15 || dy>sr.height-75) scroller.scrollTop+=dy-sr.height*.4
  if(dx<0 || dx>sr.width-25) scroller.scrollLeft+=dx-sr.width*.5
}
function openNote(mark, marginSheet) {
  if(!mark || !session) return
  notePreview.hideHover()
  const existing=marks.some(m=>m.id===mark.id)
  if (!existing) mark=assignSet(mark,sets.active)
  noteDraft={mark,session,existing,marginSheet}
  const comment = mark.type === 'comment'
  const noteTitle = mark.type === 'region' ? 'region note' : 'note'
  $('note-title').textContent = comment ? 'Comment on passage' : existing ? 'Edit '+noteTitle : 'Add a '+noteTitle
  $('passage-quote').textContent = comment ? quotedText(mark) : ''
  $('passage-quote').hidden = !comment
  $('note-label').textContent = comment ? 'Comment' : 'Note'
  $('note-save').textContent = comment ? 'Save comment' : 'Save note'
  $('note-dates').replaceChildren(...(existing ? [dateLine(mark)] : []))
  $('note-text').value=mark.text
  $('note-author').value = existing ? mark.author ?? '' : privateWindow ? privateAuthor : preference('comment-author','')
  noteDraft.applyDiscussion = openDiscussion(mark,privateWindow ? privateAuthor : preference('comment-author',''),previewDraft)
  $('note-tags').value = (mark.tags ?? []).join(', ')
  $('note-author').setCustomValidity('')
  $('note-tags').setCustomValidity('')
  $('remember-author').checked = false
  $('note-markdown').checked = mark.textFormat === 'markdown'
  $('markdown-preview').open = false
  $('markdown-preview').hidden = !$('note-markdown').checked
  $('draft-preview').replaceChildren()
  $('note-placement').value = mark.marginSide ?? ''
  $('track-note').checked = mark.done !== undefined
  $('note-done').checked = mark.done === true
  $('note-done-label').hidden = !$('track-note').checked
  $('note-dialog').showModal()
  $('note-text').focus()
}
function draftContent() {
  return {text:$('note-text').value,textFormat:$('note-markdown').checked ? 'markdown' : undefined}
}
function previewDraft() {
  if ($('markdown-preview').open && !$('markdown-preview').hidden) renderNoteText($('draft-preview'),draftContent())
}
$('note-text').addEventListener('input',previewDraft)
for (const input of [$('note-author'),$('note-tags')]) input.oninput = ()=>input.setCustomValidity('')
$('markdown-preview').ontoggle = previewDraft
$('note-markdown').onchange = () => {
  $('markdown-preview').hidden = !$('note-markdown').checked
  previewDraft()
}
$('track-note').onchange = () => { $('note-done-label').hidden = !$('track-note').checked }
$('note-form').addEventListener('submit',e=>{
  e.preventDefault()
  const draft = draftContent()
  if(!draft.text.trim()) { $('note-text').focus();return }
  if(noteDraft?.session===session) {
    const original = noteDraft.mark
    const current = marks.find(m => m.id === original.id)
    if (noteDraft.existing && !compatibleMarkTypes(current,original)) {
      toast('This note is no longer in the document.')
    } else {
      const mark = {...(current ?? original)}
      const author = $('note-author').value.trim().normalize('NFC')
      if (author && !validAuthor(author)) {
        $('note-author').setCustomValidity('Use an author name of up to 100 characters on one line.')
        $('note-author').reportValidity()
        return
      }
      if (author !== (original.author ?? '')) {
        if (author) mark.author = author
        else delete mark.author
      }
      let tags
      try { tags = parseTags($('note-tags').value) } catch (error) {
        $('note-tags').setCustomValidity(error.message)
        $('note-tags').reportValidity()
        return
      }
      const tagBase = noteDraft.tagBase ?? original.tags ?? []
      if (tags.join(',') !== tagBase.join(',')) {
        tags=mergeTags(current?.tags,tagBase,tags)
        if (tags.length>16) {
          noteDraft.tagBase=current?.tags ?? []
          $('note-tags').value=tags.join(', ')
          $('note-tags').setCustomValidity('Another tab added tags. Keep up to 16 tags before saving.')
          $('note-tags').reportValidity()
          return
        }
        if (tags.length) mark.tags = tags
        else delete mark.tags
      }
      // A textarea normalizes line endings. Preserve imported source on a format-only edit.
      if (draft.text !== original.text.replace(/\r\n?/g,'\n')) {
        mark.text = draft.textFormat ? draft.text : draft.text.trim()
      }
      if (draft.textFormat !== original.textFormat) {
        if (draft.textFormat) mark.textFormat = draft.textFormat
        else delete mark.textFormat
      }
      const side = $('note-placement').value
      if (side !== (original.marginSide ?? '')) {
        if (side) mark.marginSide = side
        else delete mark.marginSide
      }
      const done = $('track-note').checked ? $('note-done').checked : undefined
      if (done !== original.done) {
        if (done === undefined) delete mark.done
        else mark.done = done
      }
      try {
        if (!noteDraft.applyDiscussion(mark,current)) return
      } catch (error) { toast(error.message); return }
      selected = mark.id
      if (!current || ['text','textFormat','done','marginSide','tags','author','replies','history'].some(field=>current[field]!==mark[field])) {
        const next = current ? marks.map(m=>m.id===mark.id ? mark : m) : [...marks,mark]
        if (!change(next,message => {
          const input = $('note-text')
          input.setCustomValidity(message)
          input.reportValidity()
          input.setCustomValidity('')
        },current ? sets : revealSet(mark.set ?? defaultSet))) return
      }
      if ($('remember-author').checked) {
        if (privateWindow) privateAuthor = author
        else if (!savePreference('comment-author',author)) toast('The browser could not save your default author.')
      }
    }
  }
  $('note-dialog').close()
})
$('note-dialog').onclose=()=>{
  const draft = noteDraft
  noteDraft = null
  // Saving can rebuild the margin button that opened the editor.
  if (draft?.marginSheet && draft.session === session) {
    const row = draft.marginSheet.row
    const matching = selector => [...row.querySelectorAll(selector)].find(el => el.dataset.id === draft.mark.id)
    const target = matching('.margin-note') ?? matching('.note-marker')
    const action = target?.querySelector('.note-action,.note-edit-target') ?? target ?? $('scroller')
    action.focus()
  }
}
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close())
document.addEventListener('click',e=>{ if(!e.target.closest('.more,.card-menu')) closeCardMenus() })

async function digest(bytes) {
  const d=await crypto.subtle.digest('SHA-256',bytes)
  return [...new Uint8Array(d)].map(n=>n.toString(16).padStart(2,'0')).join('')
}
async function load(file,initial=[],ticket=beginImport()) {
  if(ticket!==opening) return
  const signal = AbortSignal.any([activeImport.signal, AbortSignal.timeout(90000)])
  let pdf
  const cancel = () => { if (pdf && pdf !== viewer.pdf) pdf.destroy().catch(() => {}) }
  signal.addEventListener('abort',cancel,{once:true})
  try {
    checkFileSize(file.bytes.byteLength)
    file.id=await digest(file.bytes)
    let base=file.bytes
    pdf=await readPDF(base, signal)
    const metadata=await pdf.getMetadata()
    if(metadata.info.Custom?.MarginEditor==='1') {
      const restored=await runPdfJob({operation:'unpack',bytes:base},signal)
      await pdf.destroy()
      base=restored.bytes; initial=restored.marks
      pdf=await readPDF(base, signal)
    }
    if(ticket!==opening) {await pdf.destroy();return}
    await writes
    if(ticket!==opening) {await pdf.destroy();return}
    let saved=initial, savedSets=initialSets, remembered=false
    if (!privateWindow) {
      try {
        const stored=await remember(file,initial)
        saved=stored.marks;savedSets=stored.sets;remembered=true
      } catch { /* A storage failure still permits export. */ }
    }
    if(ticket!==opening) {await pdf.destroy();return}
    signal.throwIfAborted()
    saved=readDraft(saved,pdf.numPages)
    savedSets=setView(setNames(savedSets.names,saved),savedSets)
    notePreview.clear()
    $('sets-dialog').close()
    $('recovery-dialog').close()
    timeline.close()
    $('open-timeline').disabled=false
    $('restore-draft').disabled=privateWindow
    $('restore-draft').hidden=privateWindow
    selected=null;undo=[];redo=[];marks=saved
    sets=savedSets
    session={file,base,saved,savedSets,remembered,pages:pdf.numPages}
    $('filename').textContent=file.name
    $('filename').title=file.name
    document.title=file.name+' · Margin'
    state(privateWindow ? privateStatus : remembered ? 'Saved locally' : 'Local save failed',privateWindow || remembered ? 'saved' : 'error')
    if(!privateWindow && !remembered) toast('Local storage is unavailable. Export your PDF to keep your work.')
    $('export').disabled=exporting
    $('export-annotations').disabled=false
    $('import-annotations').disabled=false
    $('filter').value='all'
    $('action-filter').value='all'
    $('annotation-search').value=''
    $('author-filter').value=''
    $('tag-filter').value=''
    viewer.setDocument(pdf,visibleMarks(marks,sets))
    selectTool('select');refresh()
    return true
  } catch(error) {
    if(pdf && pdf!==viewer.pdf) await pdf.destroy().catch(()=>{})
    if(ticket===opening) {
      const locked=error.name==='PasswordException' || error.message?.includes('encrypted')
      toast(error.name === 'DocumentLimitError' ? error.message : locked?'Open an unlocked copy of this PDF to annotate it.':'This file could not be opened as a PDF.')
      if(!session) state('Open a PDF to begin','error')
    }
    return false
  } finally { signal.removeEventListener('abort',cancel) }
}
async function openFile(file) {
  if(!file) return
  const ticket=beginImport()
  try { checkFileSize(file.size); await load({bytes:new Uint8Array(await file.arrayBuffer()),name:file.name},[],ticket) }
  catch (error) { if (ticket===opening) toast(error instanceof DocumentLimitError ? error.message : 'The selected file could not be read.') }
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

function downloadFile(blob, filename) {
  const url=URL.createObjectURL(blob)
  const link=document.createElement('a')
  link.href=url;link.download=filename
  document.body.append(link);link.click();link.remove()
  setTimeout(()=>URL.revokeObjectURL(url),60000)
}

$('export-annotations').onclick=()=>{
  if (!session) return
  try {
    const blob = exportAnnotations(session.file.id, session.pages, exportSetMarks(sets,marks), sets.names.map(key=>setLabel(sets,key)),
      sets.archived?.map(key=>setLabel(sets,key)))
    downloadFile(blob, session.file.name.replace(/\.pdf$/i,'') + '.margin-annotations.json')
  } catch (error) { toast(error.message) }
}

$('import-annotations').onclick=()=>$('annotation-file').click()
$('annotation-file').onchange=async event=>{
  const file = event.target.files[0], doc = session, signal = activeImport.signal
  event.target.value = ''
  if (!file || !doc || $('import-annotations').disabled) return
  $('import-annotations').disabled = true
  try {
    const incoming = await runPdfJob({operation:'read-annotations', file, documentSha256:doc.file.id, pages:doc.pages}, signal)
    if (doc !== session || signal.aborted) return
    const imported = importNamedSets(sets,incoming.names,incoming.marks,incoming.archived)
    const result = mergeAnnotations(marks, imported.marks, incoming.version < 9)
    const newSets = imported.view.names.length - sets.names.length
    const newlyArchived = (imported.view.archived?.length ?? 0) - (sets.archived?.length ?? 0)
    if (result.added || result.updated || newSets || newlyArchived) {
      if (!change(result.marks,toast,imported.view,false)) return
      const setCount = newSets ? ' Created '+newSets+(newSets === 1 ? ' set.' : ' sets.') : ''
      const archiveCount = newlyArchived ? ' Archived '+newlyArchived+(newlyArchived === 1 ? ' set.' : ' sets.') : ''
      toast('Annotations imported. ' + result.added + ' added, ' + result.updated + ' updated.' + setCount + archiveCount)
    } else toast(incoming.marks.length || incoming.names.length ? 'These annotations are already in this document.' : 'The file contains no annotations.')
  } catch (error) {
    if (doc === session && !signal.aborted) toast(error.message)
  } finally {
    if (doc === session) $('import-annotations').disabled = false
  }
}

async function download() {
  if(!session || exporting) return
  exporting=true;$('export').disabled=true
  const {file,base}=session, pdf=viewer.pdf, snapshot=exportSetMarks(sets,visibleMarks(marks,sets))
  try {
    const views = new Map()
    for (const number of new Set(snapshot.flatMap(mark => (mark.passages ?? [mark]).map(part => part.page)))) {
      const {width,height,userUnit,transform} = (await pdf.getPage(number)).getViewport({scale:1})
      views.set(number,{width,height,userUnit,transform})
    }
    const style = getComputedStyle($('note-text'))
    const noteFont = {fontSize:parseFloat(style.fontSize),fontFamily:style.fontFamily}
    const bytes=await runPdfJob({operation:'export',bytes:base,marks:snapshot,views,noteFont})
    downloadFile(new Blob([bytes],{type:'application/pdf'}), file.name.replace(/(?:-annotated)?\.pdf$/i,'')+'-annotated.pdf')
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
$('action-filter').onchange=cards
$('author-filter').onchange=cards
$('tag-filter').onchange=cards
$('annotation-search').oninput=()=>{
  cards()
  $('cards').scrollTop = 0
}
$('annotation-search').onkeydown=event=>{
  if (event.key === 'Escape' && event.target.value) {
    event.preventDefault()
    event.target.value = ''
    cards()
  }
}
function panel(name,visible) {
  $(name+'-panel').hidden=!visible
  $(name+'-toggle').setAttribute('aria-expanded',visible)
}
for(const name of ['pages','annotations']) {
  $(name+'-toggle').onclick=()=>panel(name,$(name+'-panel').hidden)
}
panel('pages',innerWidth>650)
panel('annotations',innerWidth>850)

// Reading preferences apply across documents in this browser profile.
function preference(key, fallback) {
  try { return localStorage.getItem('margin.' + key) ?? fallback }
  catch { return fallback }
}
function savePreference(key, value) {
  try { localStorage.setItem('margin.' + key, value); return true }
  catch { return false }
}
const appearanceControls = [...$('appearance-form').querySelectorAll('select')]
function applyAppearance() {
  notePreview.hideHover()
  const root = document.documentElement
  root.dataset.noteFont = $('note-font').value
  root.style.setProperty('--note-size', $('note-size').value + 'px')
  const box = $('note-box').value
  if (root.dataset.noteBox !== box) {
    $('note-text').style.removeProperty('height')
    viewer.preservePosition(() => { root.dataset.noteBox = box })
  }
}
function loadAppearance() {
  for (const control of appearanceControls) {
    const fallback = [...control.options].find(option => option.defaultSelected).value
    const saved = preference(control.id, fallback)
    control.value = [...control.options].some(option => option.value === saved) ? saved : fallback
  }
  applyAppearance()
}
loadAppearance()
for (const control of appearanceControls) {
  control.onchange = () => {
    savePreference(control.id, control.value)
    applyAppearance()
  }
}
$('reset-appearance').onclick = () => {
  $('appearance-form').reset()
  for (const control of appearanceControls) savePreference(control.id, control.value)
  applyAppearance()
}
window.addEventListener('storage', event => {
  if (!event.key || appearanceControls.some(control => event.key === 'margin.' + control.id)) loadAppearance()
})
for (const button of document.querySelectorAll('[data-note-appearance]')) {
  button.onclick = () => {
    notePreview.hideHover()
    const note = viewer.marks.find(mark => isNote(mark) && mark.id === selected) ?? viewer.marks.find(isNote)
    const sample = $('note-dialog').open ? draftContent() : note
    renderNoteText($('appearance-example'),sample?.text ? sample : {text:'Your note will appear at this size.'},'',false)
    $('appearance-dialog').showModal()
  }
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
for(const [action,key] of [['Select','V'],['Comment on selected text','C'],['Highlight','H'],['Draw','D'],['Note','N'],['Region','R'],['Pin / unpin focused note','P'],['Show / hide workspace','W'],['Zoom in / out','+ / −'],['Fit to width','0'],['Previous / next page','← / →'],['Undo',mod+' + Z'],['Redo',mod+' + Shift + Z'],['Open PDF',mod+' + O'],['Export PDF',mod+' + S']]) {
  const dt=document.createElement('dt'), dd=document.createElement('dd')
  dt.textContent=action;dd.textContent=key;$('key-list').append(dt,dd)
}
$('shortcuts').onclick=()=>$('keys-dialog').showModal()
document.addEventListener('keydown',e=>{
  if(document.querySelector('dialog[open]') || e.target.closest('textarea,input:not([type="checkbox"]),select,[contenteditable="true"]')) return
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
  const toolKeys={v:'select',h:'highlight',d:'draw',n:'note',r:'region'}
  if(toolKeys[key]) selectTool(toolKeys[key])
  if(key==='arrowleft' || key==='arrowright') {e.preventDefault();viewer.go(viewer.page+(key==='arrowright'?1:-1))}
  if(key==='escape') {closeCardMenus();selectTool('select')}
})

async function start() {
  const ticket=beginImport()
  const signal = activeImport.signal
  if (location.hash) {
    const clicked = location.hash === '#open'
    try {
      const source = clicked ? await chrome.runtime.sendMessage('open-clicked-pdf') : null
      history.replaceState(null,'',location.pathname)
      if (!source) throw Error()
      const url = new URL(source)
      const response = await fetch(url, {credentials:'omit', redirect:'error', referrerPolicy:'no-referrer',
        cache:'no-store', signal:AbortSignal.any([signal, AbortSignal.timeout(30000)])})
      if (!response.ok && !(url.protocol === 'file:' && response.status === 0)) throw Error()
      let name=url.pathname.split('/').pop() || 'Document.pdf'
      try {name=decodeURIComponent(name)} catch { /* Preserve the original filename. */ }
      await load({name, bytes:await readResponse(response)},[],ticket)
    } catch (error) {
      history.replaceState(null,'',location.pathname)
      if (ticket===opening) {
        state('Open a PDF to begin','error')
        toast(error instanceof DocumentLimitError ? error.message : 'This tab’s PDF could not be read. Use Open PDF to choose a local copy.')
      }
    }
    return
  }
  try {
    const last=privateWindow ? null : await lastDocument().catch(()=>null)
    if(!last || !await load(last,[],ticket)) {
      const [pdf,annotations]=await Promise.all([fetch('assets/reading-the-alps.pdf'),fetch('assets/sample-annotations.json')])
      await load({bytes:new Uint8Array(await pdf.arrayBuffer()),name:'Reading the Alps.pdf'},await annotations.json(),ticket)
    }
  } catch {if(ticket===opening) {state('Open a PDF to begin','error');toast('Choose a PDF to open your workspace.')}}
}
start()
