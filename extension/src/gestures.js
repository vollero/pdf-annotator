import { paintMark } from './annotations.js'
import { fitNotePoint, resizeNote } from './mark-data.js'
import { withMarkupStyle } from './markup.js'

const clamp = value => Math.min(1, Math.max(0, value))
const sameSize = (a,b) => a?.[0] === b?.[0] && a?.[1] === b?.[1]

function point(event, paper) {
  const rect = paper.getBoundingClientRect()
  return [clamp((event.clientX - rect.left) / rect.width), clamp((event.clientY - rect.top) / rect.height)]
}

function area(a, b) {
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])]
}

function pageOf(node) {
  return (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement)?.closest('.textLayer')?.closest('.paper')
}

function selectedRange() {
  const selection = window.getSelection()
  if (!selection.rangeCount || selection.isCollapsed) return
  const range = selection.getRangeAt(0)
  if (pageOf(range.startContainer) && pageOf(range.endContainer)) return range
}

function selectedPassages(viewer, range) {
  const first = pageOf(range.startContainer), last = pageOf(range.endContainer)
  if (!first || !last) return []
  const passages = []
  for (let number = Number(first.dataset.page); number <= Number(last.dataset.page); number++) {
    const paper = viewer.sheets[number - 1].element
    const layer = paper.querySelector('.textLayer')
    if (!layer) return []
    const part = range.cloneRange()
    if (paper !== first) part.setStart(layer, 0)
    if (paper !== last) part.setEnd(layer, layer.childNodes.length)
    const copy = part.cloneContents()
    for (const br of copy.querySelectorAll('br')) br.replaceWith('\n')
    const quote = copy.textContent
    if (!quote.trim()) continue
    const bounds = paper.getBoundingClientRect()
    const rectangles = new Map()
    // A whole-page range also includes layer containers. Measure only selected glyph runs.
    const ancestor = part.commonAncestorContainer
    const nodes = document.createTreeWalker(ancestor,NodeFilter.SHOW_TEXT)
    for (let node = ancestor.nodeType === Node.TEXT_NODE ? ancestor : nodes.nextNode(); node; node = nodes.nextNode()) {
      if (!part.intersectsNode(node)) continue
      const run = document.createRange()
      run.selectNodeContents(node)
      if (node === part.startContainer) run.setStart(node,part.startOffset)
      if (node === part.endContainer) run.setEnd(node,part.endOffset)
      for (const r of run.getClientRects()) {
        if (!r.width || !r.height) continue
        const rect = area([clamp((r.left - bounds.left) / bounds.width), clamp((r.top - bounds.top) / bounds.height)],
          [clamp((r.right - bounds.left) / bounds.width), clamp((r.bottom - bounds.top) / bounds.height)])
        if (rect[2] && rect[3]) rectangles.set(rect.join(','), rect)
      }
    }
    if (!rectangles.size) return []
    passages.push({page:number, quote, rects:[...rectangles.values()]})
  }
  return passages
}

export function bindGestures({viewer, getTool, getColor, getStyle, add, note, setNoteBox, hideNotePreview, notify}) {
  const stack = document.getElementById('sheets')
  const actions = document.getElementById('selection-actions')
  let range
  function updateSelection() {
    const inSelect = getTool() === 'select' && !document.querySelector('dialog[open]')
    const next = inSelect && selectedRange()
    if (!next && inSelect && actions.contains(document.activeElement) && range && !range.collapsed && range.startContainer.isConnected) return
    range = next ? next.cloneRange() : null
    actions.hidden = !range
  }
  document.addEventListener('selectionchange',updateSelection)
  actions.addEventListener('mousedown',event => { if (!event.target.closest('select')) event.preventDefault() })
  function applySelection(action, selected) {
    if (!selected) return
    const passages = selectedPassages(viewer,selected)
    if (!passages.length) { notify('Select visible PDF text to annotate it.'); return }
    const color = getColor()
    if (action === 'copy') {
      navigator.clipboard.writeText(passages.map(part => part.quote).join('\n')).catch(() => notify('Use the browser’s Copy command to copy the selection.'))
      return
    }
    window.getSelection().removeAllRanges()
    actions.hidden = true
    range = null
    if (action === 'highlight') {
      add(passages.map(({page,quote,rects}) => withMarkupStyle({id:crypto.randomUUID(),type:'highlight',page,color,text:quote,rects},getStyle())))
    } else {
      note(withMarkupStyle({id:crypto.randomUUID(),type:'comment',page:passages[0].page,color,text:'',passages},getStyle()))
    }
  }
  actions.addEventListener('click',event => {
    const button = event.target.closest('[data-selection]')
    if (button) applySelection(button.dataset.selection,range)
  })
  document.addEventListener('keydown',event => {
    if (event.key.toLowerCase() === 'c' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.repeat &&
        !actions.hidden && !event.target.closest('input,select,textarea,dialog,[contenteditable="true"]')) {
      event.preventDefault()
      applySelection('comment',range)
    }
  })
  let active = null
  function reset() {
    if (!active) return
    const {sheet,pointer,marker,transform,preview} = active
    active = null
    preview?.remove()
    if (marker) {
      marker.setAttribute('transform',transform)
      marker.removeAttribute('visibility')
      sheet.element.classList.remove('moving-note','resizing-note')
    }
    if (sheet.element.hasPointerCapture(pointer)) sheet.element.releasePointerCapture(pointer)
  }

  function dragNote(event, p) {
    const {sheet, mark, start, origin, ink} = active
    if (!active.marker.isConnected) {
      // Other tabs can edit the wording or color and repaint the SVG during a drag.
      const current = viewer.marks.find(m=>m.id===mark.id)
      if (current?.type!==mark.type || current.page!==mark.page ||
          current.point[0]!==mark.point[0] || current.point[1]!==mark.point[1] || !sameSize(current.size,mark.size)) return reset()
      const marker = [...ink.querySelectorAll('.movable-note')].find(el=>el.dataset.id===mark.id)
      if (!marker) return reset()
      active.marker = marker
      active.mark = current
    }
    if (!active.destination && Math.hypot(event.clientX-active.pressX,event.clientY-active.pressY)<4) return
    const {width,height} = sheet.base
    const dx = p[0]-start[0], dy = p[1]-start[1]
    if (active.resizing) {
      active.destination = origin
      active.size = resizeNote(mark,origin,width,height,dx*width,dy*height)
      active.preview?.remove()
      active.preview = paintMark({...active.mark,point:origin,size:active.size},width,height)
      active.marker.setAttribute('visibility','hidden')
      sheet.element.classList.add('resizing-note')
      ink.append(active.preview)
      return
    }
    const destination = fitNotePoint([origin[0]+dx,origin[1]+dy],width,height,mark)
    active.destination = destination
    sheet.element.classList.add('moving-note')
    active.marker.setAttribute('transform','translate('+destination[0]*width+' '+destination[1]*height+')')
  }

  function move(event) {
    if (!active || event.pointerId !== active.pointer || active.textSelection) return
    const {sheet, mark, ink} = active
    if (sheet.ink !== ink || !ink.isConnected || !sheet.element.clientWidth) return reset()
    const p = point(event, sheet.element)
    if (active.marker) return dragNote(event,p)
    const {width, height} = sheet.base
    if (mark.type === 'draw') {
      const last = mark.points.at(-1)
      if (Math.hypot((p[0] - last[0]) * width, (p[1] - last[1]) * height) < .5) return
      mark.points.push(p)
    } else if (mark.type === 'region') {
      if (!active.regionDragged && Math.hypot(event.clientX-active.pressX,event.clientY-active.pressY)<4) return
      active.regionDragged = true
      const [x,y,w,h] = area(active.start,p)
      mark.point = [x,y]
      mark.size = [w,h]
    } else if (mark.type === 'highlight') mark.rects = [area(active.start, p)]
    else return
    active.preview?.remove()
    active.preview = paintMark(mark, width, height)
    ink.append(active.preview)
  }

  stack.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !event.isPrimary || active && active.pointer!==event.pointerId) return
    const paper = event.target.closest('.paper[data-ready="true"]')
    if (!paper) return
    const sheet = viewer.sheetFor(paper), type = getTool()
    if (type === 'select') {
      const marker = event.target.closest('.note-marker')
      if (!marker) return
      const mark = viewer.marks.find(m=>m.id===marker.dataset.id)
      if (!mark) return
      if (mark.type==='comment') { note(mark); return }
      event.preventDefault()
      marker.focus({preventScroll:true})
      hideNotePreview()
      active = {sheet, ink:sheet.ink, mark, marker, pointer:event.pointerId, transform:marker.getAttribute('transform'),
        start:point(event,paper), origin:fitNotePoint(mark.point,sheet.base.width,sheet.base.height,mark),
        resizing:!!event.target.closest('.note-resize-handle'),
        pressX:event.clientX, pressY:event.clientY}
      paper.setPointerCapture(event.pointerId)
      return
    }
    reset()
    const start = point(event, paper)
    const mark = {id: crypto.randomUUID(), page: sheet.number, type, color: getColor(), text: ''}
    active = {start, mark, pointer: event.pointerId, sheet, ink: sheet.ink, pressX:event.clientX, pressY:event.clientY}
    window.getSelection().removeAllRanges()
    if (type === 'highlight' && event.target.closest('.textLayer span:not(.markedContent)')) {
      active.textSelection = true
      return
    }
    event.preventDefault()
    if (type === 'draw') { mark.points = [start]; mark.text = 'Freehand drawing' }
    if (type === 'highlight') {
      mark.rects = []
      mark.text = 'Area highlight'
      if (getStyle() !== 'highlight') { mark.style = getStyle(); mark.text = 'Marked area' }
    }
    paper.setPointerCapture(event.pointerId)
  })
  stack.addEventListener('pointermove', move)
  window.addEventListener('pointerup', event => {
    if (!active || event.pointerId !== active.pointer) return
    const {mark, start, sheet, ink, textSelection} = active
    if (sheet.ink !== ink || !ink.isConnected) return reset()
    if (!textSelection) move(event)
    if (!active) return
    if (active.marker) {
      const {destination,origin,resizing,size} = active
      reset()
      if (resizing) {
        if (destination && !sameSize(size,mark.size)) setNoteBox(mark.id,origin,size)
      } else if (!destination) note(viewer.marks.find(m=>m.id===mark.id))
      else if (destination[0]!==origin[0] || destination[1]!==origin[1]) setNoteBox(mark.id,destination,mark.size)
      return
    }
    const {regionDragged} = active
    reset()
    const {width, height} = sheet.base
    if (textSelection) {
      requestAnimationFrame(() => {
        if (ink !== sheet.ink || !ink.isConnected) return
        applySelection('highlight',selectedRange())
      })
    } else if (mark.type === 'region') {
      if (!regionDragged) {
        mark.size = [Math.min(1,96/width),Math.min(1,64/height)]
        mark.point = fitNotePoint(start,width,height,mark)
      } else if (mark.size[0]*width<2 || mark.size[1]*height<2) return
      note(mark)
    } else if (mark.type === 'note') {
      mark.point = fitNotePoint(start,width,height,mark)
      note(mark)
    } else if (mark.type === 'draw') {
      if (mark.points.length === 1) {
        const [x, y] = start
        mark.points.push([clamp(x + (x > .5 ? -.2 : .2) / width), y])
      }
      add([mark])
    } else if (mark.rects[0][2] * width >= 2 && mark.rects[0][3] * height >= 2) add([mark])
  })
  stack.addEventListener('pointercancel',event=>{ if (event.pointerId===active?.pointer) reset() })
  stack.addEventListener('keydown',event=>{
    const steps = {ArrowRight:[12,0],ArrowLeft:[-12,0],ArrowDown:[0,12],ArrowUp:[0,-12]}
    const marker = event.target.closest('.movable-note')
    if (active || !marker || getTool()!=='select' || !event.shiftKey || !Object.hasOwn(steps,event.key)) return
    event.preventDefault()
    event.stopPropagation()
    const mark = viewer.marks.find(m=>m.id===marker.dataset.id)
    const paper = marker.closest('.paper'), {width,height} = viewer.sheetFor(paper).base
    const origin = fitNotePoint(mark.point,width,height,mark)
    const size = resizeNote(mark,origin,width,height,...steps[event.key])
    if (sameSize(size,mark.size)) return
    setNoteBox(mark.id,origin,size)
    for (const next of paper.querySelectorAll('.movable-note')) {
      if (next.dataset.id===mark.id) { next.focus({preventScroll:true}); break }
    }
  })
  stack.addEventListener('lostpointercapture',event=>{
    if (event.pointerId===active?.pointer && event.target===active.sheet.element) reset()
  })
  window.addEventListener('keydown',event=>{
    if (event.key==='Escape' && (active?.marker || active?.mark.type==='region')) {
      event.preventDefault()
      event.stopPropagation()
      reset()
    }
  },true)
  window.addEventListener('blur', reset)
  return () => { reset(); range = null; actions.hidden = true }
}
