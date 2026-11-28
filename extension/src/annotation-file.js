import { checkMarkBudget, maxMarkCount, readMark } from './mark-data.js'
import { maxNamedSets, setNames, validSetName } from './annotation-sets.js'

const format = 'margin-annotations'
const maxFileBytes = 16 * 1024 * 1024
const hashPattern = /^[0-9a-f]{64}$/
const latestVersion = 10

function requiredVersion(mark) {
  if (mark.author || mark.tags) return 10
  if (mark.set) return 9
  if (mark.textFormat) return 8
  if (mark.marginSide) return 7
  if (mark.type === 'region') return 6
  if (mark.size) return 5
  if (mark.style) return 4
  if (mark.type === 'comment') return 3
  if (mark.done !== undefined) return 2
  return 1
}

function portableMarks(entries, pages, version) {
  if (!Array.isArray(entries) || entries.length > maxMarkCount) {
    throw new Error('Invalid annotation list or too many annotations in this file.')
  }
  const ids = new Set()
  const marks = entries.map((entry, index) => {
    const page = entry?.page
    const mark = Number.isInteger(page) && page >= 1 && page <= pages && readMark(entry, page, pages)
    if (!mark || version < requiredVersion(mark) ||
        ids.has(mark.id) || Object.keys(entry).some(key => !Object.hasOwn(mark, key))) {
      throw new Error('Invalid or duplicate annotation at position ' + (index + 1) + '.')
    }
    ids.add(mark.id)
    return mark
  })
  checkMarkBudget(marks)
  return marks
}

export function exportAnnotations(documentSha256, pages, marks, names = []) {
  if (!hashPattern.test(documentSha256)) throw new Error('The PDF fingerprint is unavailable.')
  const annotations = portableMarks(marks, pages, latestVersion)
  const sets = setNames(names,annotations)
  const version = Math.max(sets.length ? 9 : 1,...annotations.map(requiredVersion))
  return new Blob([JSON.stringify({format, version, documentSha256, ...(version >= 9 ? {sets} : {}), annotations})], {type:'application/json'})
}

export async function readAnnotationFile(file, documentSha256, pages) {
  if (file.size > maxFileBytes) throw new Error('Annotation files can be up to 16 MiB.')
  let data
  try { data = JSON.parse(await file.text()) }
  catch { throw new Error('Choose a Margin annotations JSON file.') }
  if (data?.format !== format) throw new Error('Choose a Margin annotations JSON file.')
  if (!Number.isInteger(data.version) || data.version < 1 || data.version > latestVersion) throw new Error('This annotation file version is unsupported.')
  if (typeof data.documentSha256 !== 'string' || !hashPattern.test(data.documentSha256) ||
      Object.keys(data).some(key => !['format','version','documentSha256','annotations'].includes(key) && !(data.version >= 9 && key === 'sets'))) {
    throw new Error('Invalid Margin annotation file.')
  }
  if (data.documentSha256 !== documentSha256) {
    throw new Error('The PDF fingerprint does not match. Open the exact PDF used for this annotation export.')
  }
  const marks = portableMarks(data.annotations, pages, data.version)
  const names = data.version >= 9 ? data.sets : []
  if (!Array.isArray(names) || names.length > maxNamedSets || names.some(name=>!validSetName(name)) ||
      new Set(names).size !== names.length || marks.some(mark=>mark.set && !names.includes(mark.set))) {
    throw new Error('Invalid annotation set list or membership.')
  }
  return {marks,names,version:data.version}
}

export async function readAnnotations(file,documentSha256,pages) {
  return (await readAnnotationFile(file,documentSha256,pages)).marks
}

// Keep local-only marks and preserve object identities for unchanged entries.
// The draft store uses those identities to distinguish edits across tabs.
export function mergeAnnotations(current, incoming, preserveLocalSets = false) {
  const byId = new Map(current.map(mark => [mark.id, mark]))
  let added = 0, updated = 0
  for (const entry of incoming) {
    const local = byId.get(entry.id)
    const mark = preserveLocalSets && local?.set ? {...entry,set:local.set} : entry
    if (local) {
      if (JSON.stringify(readMark(local, local.page)) === JSON.stringify(readMark(mark,mark.page))) continue
      updated++
    } else added++
    byId.set(mark.id, mark)
  }
  const marks = [...byId.values()]
  checkMarkBudget(marks)
  return {marks, added, updated}
}
