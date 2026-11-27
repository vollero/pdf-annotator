import { DocumentLimitError } from './input.js'

export const maxMarkCount = 2000

const point = p => Array.isArray(p) && p.length === 2 && p.every(unit)
const rect = r => Array.isArray(r) && r.length === 4 && r.every(unit)
function unit(v) { return Number.isFinite(v) && v >= 0 && v <= 1 }

export function readMark(raw, page) {
  if (!raw || typeof raw.id !== 'string' || !raw.id || raw.id.length > 128 ||
      typeof raw.text !== 'string' || typeof raw.color !== 'string' || !/^#[a-f0-9]{6}$/i.test(raw.color)) return
  const {id, type, text, color} = raw
  const mark = {id, type, text, color, page}
  if (type === 'note' && point(raw.point)) {
    if (!Object.hasOwn(raw, 'done')) return {...mark, point:raw.point}
    if (typeof raw.done === 'boolean') return {...mark, point:raw.point, done:raw.done}
  }
  if (type === 'draw' && Array.isArray(raw.points) && raw.points.length > 1 && raw.points.every(point)) return {...mark, points:raw.points}
  if (type === 'highlight' && Array.isArray(raw.rects) && raw.rects.length && raw.rects.every(rect)) return {...mark, rects:raw.rects}
}

export function noteStatus(mark) {
  return mark.done === undefined ? '' : mark.done ? 'Done' : 'To do'
}

const encodedSizes = new WeakMap()
export function checkMarkBudget(marks) {
  let geometry = 0, characters = 0, encoded = 0
  for (const mark of marks) {
    geometry += mark.points?.length ?? mark.rects?.length ?? 1
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
    const mark = readMark(entry,entry.page)
    if (!mark) continue
    let suffix = 0
    while (ids.has(mark.id)) mark.id = 'margin-copy-' + marks.length + '-' + ++suffix
    ids.add(mark.id)
    marks.push(mark)
  }
  checkMarkBudget(marks)
  return marks
}
