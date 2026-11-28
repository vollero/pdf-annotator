import { checkMarkBudget, maxMarkCount, readMark } from './mark-data.js'

const format = 'margin-annotations'
const maxFileBytes = 16 * 1024 * 1024
const hashPattern = /^[0-9a-f]{64}$/

function portableMarks(entries, pages, version) {
  if (!Array.isArray(entries) || entries.length > maxMarkCount) {
    throw new Error('Invalid annotation list or too many annotations in this file.')
  }
  const ids = new Set()
  const marks = entries.map((entry, index) => {
    const page = entry?.page
    const mark = Number.isInteger(page) && page >= 1 && page <= pages && readMark(entry, page, pages)
    if (!mark || (version < 4 && mark.style) || (version < 3 && mark.type === 'comment') || (version === 1 && Object.hasOwn(mark, 'done')) ||
        ids.has(mark.id) || Object.keys(entry).some(key => !Object.hasOwn(mark, key))) {
      throw new Error('Invalid or duplicate annotation at position ' + (index + 1) + '.')
    }
    ids.add(mark.id)
    return mark
  })
  checkMarkBudget(marks)
  return marks
}

export function exportAnnotations(documentSha256, pages, marks) {
  if (!hashPattern.test(documentSha256)) throw new Error('The PDF fingerprint is unavailable.')
  const annotations = portableMarks(marks, pages, 4)
  let version = 1
  if (annotations.some(mark => mark.style)) version = 4
  else if (annotations.some(mark => mark.type === 'comment')) version = 3
  else if (annotations.some(mark => mark.done !== undefined)) version = 2
  return new Blob([JSON.stringify({format, version, documentSha256, annotations})], {type:'application/json'})
}

export async function readAnnotations(file, documentSha256, pages) {
  if (file.size > maxFileBytes) throw new Error('Annotation files can be up to 16 MiB.')
  let data
  try { data = JSON.parse(await file.text()) }
  catch { throw new Error('Choose a Margin annotations JSON file.') }
  if (data?.format !== format) throw new Error('Choose a Margin annotations JSON file.')
  if (![1,2,3,4].includes(data.version)) throw new Error('This annotation file version is unsupported.')
  if (typeof data.documentSha256 !== 'string' || !hashPattern.test(data.documentSha256) ||
      Object.keys(data).some(key => !['format','version','documentSha256','annotations'].includes(key))) {
    throw new Error('Invalid Margin annotation file.')
  }
  if (data.documentSha256 !== documentSha256) {
    throw new Error('The PDF fingerprint does not match. Open the exact PDF used for this annotation export.')
  }
  return portableMarks(data.annotations, pages, data.version)
}

// Keep local-only marks and preserve object identities for unchanged entries.
// The draft store uses those identities to distinguish edits across tabs.
export function mergeAnnotations(current, incoming) {
  const byId = new Map(current.map(mark => [mark.id, mark]))
  let added = 0, updated = 0
  for (const mark of incoming) {
    const local = byId.get(mark.id)
    if (local) {
      if (JSON.stringify(readMark(local, local.page)) === JSON.stringify(mark)) continue
      updated++
    } else added++
    byId.set(mark.id, mark)
  }
  const marks = [...byId.values()]
  checkMarkBudget(marks)
  return {marks, added, updated}
}
