import { paintMark } from './annotations.js'

const clamp = value => Math.min(1, Math.max(0, value))

function point(event, paper) {
  const rect = paper.getBoundingClientRect()
  return [clamp((event.clientX - rect.left) / rect.width), clamp((event.clientY - rect.top) / rect.height)]
}

function area(a, b) {
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])]
}

// A text selection can cross a page break. Each PDF highlight belongs to one page.
function selectedHighlights(viewer, mark) {
  const selection = window.getSelection()
  if (!selection.rangeCount || selection.isCollapsed) return []
  const range = selection.getRangeAt(0)
  const pageOf = node => (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement)
    ?.closest('.textLayer')?.closest('.paper')
  const first = pageOf(range.startContainer), last = pageOf(range.endContainer)
  if (!first || !last) return []
  const highlights = []
  for (let number = Number(first.dataset.page); number <= Number(last.dataset.page); number++) {
    const paper = viewer.sheets[number - 1].element
    const layer = paper.querySelector('.textLayer')
    if (!layer) continue
    const part = range.cloneRange()
    if (paper !== first) part.setStart(layer, 0)
    if (paper !== last) part.setEnd(layer, layer.childNodes.length)
    const text = part.toString().trim()
    const bounds = paper.getBoundingClientRect()
    const rectangles = new Map()
    for (const r of part.getClientRects()) {
      if (r.width <= 1 || r.height <= 1) continue
      const rect = area([clamp((r.left - bounds.left) / bounds.width), clamp((r.top - bounds.top) / bounds.height)],
        [clamp((r.right - bounds.left) / bounds.width), clamp((r.bottom - bounds.top) / bounds.height)])
      rectangles.set(rect.join(','), rect)
    }
    if (text && rectangles.size) {
      highlights.push({...mark, id: crypto.randomUUID(), page: number, text, rects: [...rectangles.values()]})
    }
  }
  selection.removeAllRanges()
  return highlights
}

export function bindGestures({viewer, getTool, getColor, add, note, editNote}) {
  const stack = document.getElementById('sheets')
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
    if (type === 'highlight') { mark.rects = []; mark.text = 'Area highlight' }
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
        const highlights = selectedHighlights(viewer, mark)
        if (highlights.length) add(highlights)
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
  return reset
}
