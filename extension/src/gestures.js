import { paintMark } from './annotations.js'
import { withMarkupStyle } from './markup.js'

const clamp = value => Math.min(1, Math.max(0, value))

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

export function bindGestures({viewer, getTool, getColor, getStyle, add, note, editNote, notify}) {
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
    active?.preview?.remove()
    active = null
  }

  function move(event) {
    if (!active || event.pointerId !== active.pointer || active.textSelection) return
    const {sheet, mark, ink} = active
    if (sheet.ink !== ink || !ink.isConnected) return reset()
    const p = point(event, sheet.element)
    const {width, height} = sheet.base
    if (mark.type === 'draw') {
      const last = mark.points.at(-1)
      if (Math.hypot((p[0] - last[0]) * width, (p[1] - last[1]) * height) < .5) return
      mark.points.push(p)
    } else if (mark.type === 'highlight') mark.rects = [area(active.start, p)]
    else return
    active.preview?.remove()
    active.preview = paintMark(mark, width, height)
    ink.append(active.preview)
  }

  stack.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !event.isPrimary) return
    const paper = event.target.closest('.paper[data-ready="true"]')
    if (!paper) return
    const sheet = viewer.sheetFor(paper), type = getTool()
    if (type === 'select') {
      const marker = event.target.closest('.note-marker')
      if (marker) editNote(marker.dataset.id)
      return
    }
    reset()
    const start = point(event, paper)
    const mark = {id: crypto.randomUUID(), page: sheet.number, type, color: getColor(), text: ''}
    active = {start, mark, pointer: event.pointerId, sheet, ink: sheet.ink}
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
    reset()
    const {width, height} = sheet.base
    if (textSelection) {
      requestAnimationFrame(() => {
        if (ink !== sheet.ink || !ink.isConnected) return
        applySelection('highlight',selectedRange())
      })
    } else if (mark.type === 'note') {
      mark.point = [Math.min(start[0], Math.max(0, 1 - 18 / width)), Math.min(start[1], Math.max(0, 1 - 18 / height))]
      note(mark)
    } else if (mark.type === 'draw') {
      if (mark.points.length === 1) {
        const [x, y] = start
        mark.points.push([clamp(x + (x > .5 ? -.2 : .2) / width), y])
      }
      add([mark])
    } else if (mark.rects[0][2] * width >= 2 && mark.rects[0][3] * height >= 2) add([mark])
  })
  stack.addEventListener('pointercancel', reset)
  window.addEventListener('blur', reset)
  return () => { reset(); range = null; actions.hidden = true }
}
