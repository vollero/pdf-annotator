import { annotationEvents, localDateTime } from './annotation-dates.js'
import { visibleMarks, setNames, setView } from './annotation-sets.js'
import { threadRows } from './discussion.js'
import { noteStatus,readDraft } from './mark-data.js'
import { titles } from './annotations.js'
import { timelineIndex, timelineSnapshot, setTimelineRecording, clearTimeline } from './storage.js'

const $ = id=>document.getElementById(id)
function dayOf(at) {
  const date = new Date(at)
  return [date.getFullYear().toString().padStart(4,'0'),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-')
}
function markTitle(mark) { return titles[mark.type]+' · Page '+mark.page }

export function bindTimeline({current,flush,preview,returnToDraft,privateWindow,notify}) {
  const dialog=$('timeline-dialog'), mode=$('timeline-mode'), slider=$('timeline-slider'), picker=$('timeline-mark')
  let opened, events=[], index, position, generation=0, snapshotMarks=[]
  const drafts = ()=>mode.value==='drafts'
  const moments = ()=>drafts() ? index.entries : events
  function inspect(mark,text,author) {
    if (mark) preview(drafts() ? snapshotMarks : [mark],mark)
    const parts = [author,text]
    if (drafts() && mark) {
      parts.push([noteStatus(mark),...(mark.tags ?? []).map(tag=>'#'+tag)].filter(Boolean).join(' · '))
      for (const {entry,number,parentNumber} of threadRows(mark.replies)) {
        parts.push('#'+number+(parentNumber ? ' to #'+parentNumber : '')+' · '+(entry.author ?? 'Anonymous')+' · '+localDateTime(entry.at)+'\n'+entry.text)
      }
    }
    $('timeline-text').textContent = parts.filter(Boolean).join('\n')
  }
  function renderNavigation(count) {
    $('timeline-earlier').disabled = position<=0
    $('timeline-later').disabled = position>=count-1
    slider.disabled = count<2
    slider.max = String(Math.max(0,count-1))
    slider.value = String(Math.max(0,position))
    $('timeline-day').disabled = !count
    $('timeline-position').textContent = position<0 ? '0 of '+count : (position+1)+' of '+count
  }
  async function show(next,keepDay=false) {
    const token=++generation
    const list=moments()
    position=Math.min(list.length-1,Math.max(-1,next))
    const moment=list[position]
    renderNavigation(list.length)
    $('timeline-mark-field').hidden=true
    $('timeline-text').textContent=''
    $('timeline-clear').hidden=!index.entries.length
    $('timeline-recording').hidden=!drafts() || privateWindow
    $('timeline-info').textContent = drafts() ? privateWindow ? 'Local draft recording is available in a regular window.' :
      'Preview up to 50 locally recorded states. Earlier and Later step through saved changes.' :
      'Dates lead to the current annotation. Saved versions and replies show their recorded wording.'
    if (!keepDay) $('timeline-day').value = moment ? dayOf(moment.at) : ''
    if (!moment) {
      preview([])
      $('timeline-description').textContent = list.length ? 'No entry on or before this date.' : drafts() ?
        'No drafts recorded for this PDF.' : 'No dated annotations in the visible sets.'
      return
    }
    const stamp=localDateTime(moment.at)
    if (!drafts()) {
      $('timeline-description').textContent = moment.kind+' · '+stamp+' · '+markTitle(moment.mark)
      inspect(moment.mark,moment.entry?.text ?? moment.mark.text,moment.entry ? moment.entry.author ?? 'Anonymous' : moment.mark.author)
      return
    }
    preview([])
    $('timeline-description').textContent='Loading recorded draft…'
    try {
      const snapshot=await timelineSnapshot(opened.doc.file.id,moment.key)
      if (token!==generation || !opened) return
      if (!snapshot) {
        $('timeline-description').textContent='This draft has expired. Reopen the timeline to refresh the list.'
        return
      }
      const marks=readDraft(snapshot.marks,opened.doc.pages)
      snapshotMarks=visibleMarks(marks,setView(setNames(snapshot.sets.names,marks),snapshot.sets))
      $('timeline-description').textContent = stamp+' · '+snapshotMarks.length+' visible of '+marks.length+' annotations'
      picker.replaceChildren(...snapshotMarks.map((mark,i)=>new Option(markTitle(mark)+' · '+mark.text.slice(0,60),String(i))))
      $('timeline-mark-field').hidden=!snapshotMarks.length
      const mark=snapshotMarks[0]
      if (mark) inspect(mark,mark.text,mark.author)
    } catch { if (token===generation) $('timeline-description').textContent='Could not read this recorded draft.' }
  }
  $('open-timeline').onclick=async()=>{
    const start=current()
    if (!start.doc || opened) return
    await flush()
    let recorded = {enabled:false,entries:[]}
    if (!privateWindow) {
      try { recorded=await timelineIndex(start.doc.file.id) }
      catch { notify('Local draft recording is unavailable.') }
    }
    const state=current()
    if (start.doc!==state.doc || opened) return
    opened=state
    events=annotationEvents(visibleMarks(state.marks,state.sets))
    index=recorded
    mode.value='dates'
    $('timeline-record').checked=index.enabled
    dialog.showModal()
    show(events.length-1)
  }
  mode.onchange=()=>show(moments().length-1)
  $('timeline-record').onchange=async event=>{
    const box=event.target, doc=opened.doc
    box.disabled=true
    try {
      await setTimelineRecording(doc.file.id,box.checked)
      const refreshed=await timelineIndex(doc.file.id)
      if (opened?.doc!==doc) return
      index=refreshed
      box.checked=index.enabled
      show(moments().length-1)
    } catch { box.checked=index.enabled; notify('The recording setting could not be saved.') }
    finally { box.disabled=false }
  }
  $('timeline-clear').onclick=async()=>{
    const doc=opened?.doc
    if (!doc || privateWindow || !window.confirm('Delete all recorded timeline drafts for this PDF and stop recording? Your current draft will stay available.')) return
    try {
      await clearTimeline(doc.file.id)
      if (opened?.doc!==doc) return
      index={enabled:false,entries:[]}
      $('timeline-record').checked=false
      show(-1)
    } catch { notify('Could not clear the recorded drafts.') }
  }
  $('timeline-earlier').onclick=()=>show(position-1)
  $('timeline-later').onclick=()=>show(position+1)
  slider.oninput=()=>show(Number(slider.value))
  $('timeline-day').onchange=event=>{
    const day=event.target.value
    show(day ? moments().findLastIndex(item=>dayOf(item.at)<=day) : moments().length-1,!!day)
  }
  picker.onchange=()=>{
    const mark=snapshotMarks[Number(picker.value)]
    if (mark) inspect(mark,mark.text,mark.author)
  }
  dialog.onclose=()=>{
    const state=opened
    opened=null; generation++; snapshotMarks=[]; events=[]
    if (state && state.doc===current().doc) returnToDraft(state)
  }
  return {get active() { return !!opened },close:()=>dialog.close()}
}
