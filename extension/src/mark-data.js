import { DocumentLimitError, maxPages } from './input.js'
import { markupLabels } from './markup.js'

export const maxMarkCount = 2000

const point = p => Array.isArray(p) && p.length === 2 && p.every(unit)
const rect = r => Array.isArray(r) && r.length === 4 && r.every(unit)
function unit(v) { return Number.isFinite(v) && v >= 0 && v <= 1 }

export function noteDimensions(size, width, height) {
  return [Math.min(width,Math.max(18,(size?.[0] ?? 0)*width)),
    Math.min(height,Math.max(18,(size?.[1] ?? 0)*height))]
}

// Store positions and sizes relative to the displayed, rotated crop box.
export function fitNotePoint([x,y], width, height, size) {
  const [w,h] = noteDimensions(size,width,height)
  return [Math.max(0,Math.min(x,1-w/width)),Math.max(0,Math.min(y,1-h/height))]
}

export function resizeNote(size, origin, width, height, dx, dy) {
  const [w,h] = noteDimensions(size,width,height)
  const nextW = Math.min((1-origin[0])*width,Math.max(18,w+dx))
  const nextH = Math.min((1-origin[1])*height,Math.max(18,h+dy))
  if (nextW <= 18.00001 && nextH <= 18.00001) return
  return [nextW/width,nextH/height]
}

export function readMark(raw, page, pages = maxPages) {
  if (!raw || typeof raw.id !== 'string' || !raw.id || raw.id.length > 128 ||
      typeof raw.text !== 'string' || typeof raw.color !== 'string' || !/^#[a-f0-9]{6}$/i.test(raw.color)) return
  const {id, type, text, color} = raw
  const mark = {id, type, text, color, page}
  if (Object.hasOwn(raw,'size')) {
    if (type !== 'note' || !point(raw.size) || raw.size.some(n=>n===0)) return
    mark.size = raw.size
  }
  if (Object.hasOwn(raw,'style')) {
    if ((type !== 'highlight' && type !== 'comment') || typeof raw.style !== 'string' ||
        raw.style === 'highlight' || !Object.hasOwn(markupLabels,raw.style)) return
    mark.style = raw.style
  }
  if (type === 'note' || type === 'comment') {
    if (Object.hasOwn(raw,'done') && typeof raw.done !== 'boolean') return
    if (type === 'note') {
      if (!point(raw.point)) return
      mark.point = raw.point
    } else {
      if (!text.trim() || !Array.isArray(raw.passages) || raw.passages.length > pages || raw.passages[0]?.page !== page) return
      let previous = 0
      for (const part of raw.passages) {
        if (!Number.isInteger(part?.page) || part.page <= previous || part.page > pages ||
            typeof part.quote !== 'string' || !part.quote.trim() ||
            !Array.isArray(part.rects) || !part.rects.length || !part.rects.every(rect) ||
            Object.keys(part).some(key => !['page','quote','rects'].includes(key))) return
        previous = part.page
      }
      mark.passages = raw.passages.map(({page,quote,rects}) => ({page,quote,rects}))
    }
    if (raw.done !== undefined) mark.done = raw.done
    return mark
  }
  if (type === 'draw' && Array.isArray(raw.points) && raw.points.length > 1 && raw.points.every(point)) return {...mark, points:raw.points}
  if (type === 'highlight' && Array.isArray(raw.rects) && raw.rects.length && raw.rects.every(rect)) return {...mark, rects:raw.rects}
}

export function partOnPage(mark, page) {
  if (mark.type === 'comment') return mark.passages.find(part => part.page === page)
  return mark.page === page ? mark : undefined
}

export function quotedText(mark) {
  return mark.passages.map(part => part.quote).join('\n')
}

export function noteStatus(mark) {
  return mark.done === undefined ? '' : mark.done ? 'Done' : 'To do'
}

const encodedSizes = new WeakMap()
export function checkMarkBudget(marks) {
  let geometry = 0, characters = 0, encoded = 0
  for (const mark of marks) {
    if (mark.type === 'comment') {
      for (const part of mark.passages) {
        geometry += part.rects.length
        characters += part.quote.length
      }
    } else geometry += mark.points?.length ?? mark.rects?.length ?? 1
    characters += mark.text.length
    let size = encodedSizes.get(mark)
    if (size === undefined) {
      size = JSON.stringify(mark).length * 4 + 6
      encodedSizes.set(mark,size)
    }
    if (size > 8 * 1024 * 1024) throw new DocumentLimitError('This annotation exceeds the editable size limit.')
    encoded += size
  }
  if (marks.length > maxMarkCount || geometry > 100000 || characters > 2000000 || encoded > 32 * 1024 * 1024) {
    throw new DocumentLimitError('This document exceeds the editable annotation limit.')
  }
}

export function readDraft(raw, pages) {
  if (!Array.isArray(raw) || raw.length > maxMarkCount) throw new DocumentLimitError('This draft exceeds the editable annotation limit.')
  const marks = []
  const ids = new Set()
  for (const entry of raw) {
    if (!Number.isInteger(entry?.page) || entry.page < 1 || entry.page > pages) continue
    const mark = readMark(entry,entry.page,pages)
    if (!mark) continue
    let suffix = 0
    while (ids.has(mark.id)) mark.id = 'margin-copy-' + marks.length + '-' + ++suffix
    ids.add(mark.id)
    marks.push(mark)
  }
  checkMarkBudget(marks)
  return marks
}
