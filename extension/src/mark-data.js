import {validRefs} from './notebook-data.js'
import { validMarkDates } from './annotation-dates.js'
import { DocumentLimitError, maxPages } from './input.js'
import { markupLabels } from './markup.js'
import { validSetName } from './annotation-sets.js'
import { validAuthor, validTags } from './comment-details.js'

import { checkDiscussion } from './discussion.js'

export const maxMarkCount = 2000

const point = p => Array.isArray(p) && p.length === 2 && p.every(unit)
const rect = r => Array.isArray(r) && r.length === 4 && r.every(unit)
function unit(v) { return Number.isFinite(v) && v >= 0 && v <= 1 }

export function isPageNote(mark) {
  return mark?.type === 'note' || mark?.type === 'region'
}

export function isNote(mark) {
  return isPageNote(mark) || mark.type === 'comment'
}

// Point and region notes share editable text, color and action status.
export function compatibleMarkTypes(a,b) {
  return a?.type === b?.type || (isPageNote(a) && isPageNote(b))
}

export function noteDimensions(mark, width, height) {
  const {size} = mark
  if (mark.type === 'region') return [size[0]*width,size[1]*height]
  return [Math.min(width,Math.max(18,(size?.[0] ?? 0)*width)),
    Math.min(height,Math.max(18,(size?.[1] ?? 0)*height))]
}

// Store positions and sizes relative to the displayed, rotated crop box.
export function fitNotePoint([x,y], width, height, mark) {
  const [w,h] = noteDimensions(mark,width,height)
  return [Math.max(0,Math.min(x,1-w/width)),Math.max(0,Math.min(y,1-h/height))]
}

export function defaultRegionSize(width,height) {
  return [Math.min(1,96/width),Math.min(1,64/height)]
}

export function convertPageNote(mark,width,height) {
  const converted = {...mark}
  if (mark.type === 'note') {
    converted.type = 'region'
    if (mark.size) {
      const [w,h] = noteDimensions(mark,width,height)
      converted.size = [w/width,h/height]
    } else converted.size = defaultRegionSize(width,height)
  } else {
    converted.type = 'note'
    delete converted.size
  }
  converted.point = fitNotePoint(mark.point,width,height,converted)
  return converted
}

export function resizeNote(mark, origin, width, height, dx, dy) {
  const [w,h] = noteDimensions(mark,width,height)
  const region = mark.type === 'region'
  const nextW = Math.min((1-origin[0])*width,Math.max(region ? Math.min(6,w) : 18,w+dx))
  const nextH = Math.min((1-origin[1])*height,Math.max(region ? Math.min(6,h) : 18,h+dy))
  if (!region && nextW <= 18.00001 && nextH <= 18.00001) return
  return [nextW/width,nextH/height]
}

export function readMark(raw, page, pages = maxPages) {
  if (!raw || typeof raw.id !== 'string' || !raw.id || raw.id.length > 128 ||
      typeof raw.text !== 'string' || typeof raw.color !== 'string' || !/^#[a-f0-9]{6}$/i.test(raw.color)) return
  if (!validMarkDates(raw)) return
  const {id, type, text, color} = raw
  const mark = {id, type, text, color, page}
  if (Object.hasOwn(raw,'notebook')) {
    if (!isNote(mark) || !validRefs(raw.notebook)) return
    mark.notebook=raw.notebook
  }
  if (Object.hasOwn(raw,'ink')) {
    const ink=raw.ink
    if(type!=='draw' || !ink || !['pen','highlight'].includes(ink.brush) ||
      !(ink.width>0 && ink.width<=.05 && Number.isFinite(ink.width)) ||
      !Array.isArray(ink.pressure) || ink.pressure.length!==raw.points?.length || !ink.pressure.every(unit) ||
      Object.keys(ink).some(k=>!['brush','width','pressure'].includes(k))) return
    mark.ink=ink
  }
  if (raw.createdAt) mark.createdAt = raw.createdAt
  if (raw.updatedAt) mark.updatedAt = raw.updatedAt
  if (Object.hasOwn(raw,'history') || Object.hasOwn(raw,'replies')) {
    if (!isNote(mark)) return
    try { checkDiscussion(raw) } catch { return }
    if (raw.history) mark.history = raw.history
    if (raw.replies) mark.replies = raw.replies
  }
  if (Object.hasOwn(raw,'author')) {
    if (!isNote(mark) || !validAuthor(raw.author)) return
    mark.author = raw.author
  }
  if (Object.hasOwn(raw,'tags')) {
    if (!isNote(mark) || !validTags(raw.tags)) return
    mark.tags = raw.tags
  }
  if (Object.hasOwn(raw,'set')) {
    if (!validSetName(raw.set)) return
    mark.set = raw.set
  }
  if (Object.hasOwn(raw,'textFormat')) {
    if (!isNote(mark) || raw.textFormat !== 'markdown') return
    mark.textFormat = raw.textFormat
  }
  if (Object.hasOwn(raw,'marginSide')) {
    if (!isNote(mark) || (raw.marginSide !== 'left' && raw.marginSide !== 'right')) return
    mark.marginSide = raw.marginSide
  }
  if (Object.hasOwn(raw,'size')) {
    if ((type !== 'note' && type !== 'region') || !point(raw.size) || raw.size.some(n=>n===0)) return
    mark.size = raw.size
  }
  if (Object.hasOwn(raw,'style')) {
    if ((type !== 'highlight' && type !== 'comment') || typeof raw.style !== 'string' ||
        raw.style === 'highlight' || !Object.hasOwn(markupLabels,raw.style)) return
    mark.style = raw.style
  }
  if (isNote(mark)) {
    if (Object.hasOwn(raw,'done') && typeof raw.done !== 'boolean') return
    if (type !== 'comment') {
      if (!point(raw.point)) return
      if (type === 'region' && (!mark.size || !text.trim() ||
          raw.point.some((value,i)=>value+mark.size[i]>1+Number.EPSILON))) return
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
    characters += mark.author?.length ?? 0
    if (mark.tags?.length>16) throw new DocumentLimitError('A comment can have up to 16 tags.')
    for (const tag of mark.tags ?? []) characters += tag.length
    for (const entries of [mark.history?.versions,mark.replies]) {
      for (const entry of entries ?? []) characters += entry.text.length + (entry.author?.length ?? 0)
    }
    let size = encodedSizes.get(mark)
    if (size === undefined) {
      checkDiscussion(mark)
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
