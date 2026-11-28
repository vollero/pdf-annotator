import { validDate } from './annotation-dates.js'
import { validAuthor } from './comment-details.js'

const limit = 200
const recordId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value)
const own = (object,key)=>Object.hasOwn(object,key)

function checkRecords(records,kind) {
  if (!Array.isArray(records) || !records.length || records.length > limit) {
    throw new Error('A note can have up to 200 replies and 200 saved versions.')
  }
  const seen = new Set()
  const reply = kind === 'reply'
  const fields = ['id','at','text','author',...(reply ? ['parent'] : ['textFormat','baseline'])]
  for (const entry of records) {
    if (!entry || !recordId(entry.id) || seen.has(entry.id) ||
        !validDate(entry.at) || typeof entry.text !== 'string' ||
        (reply && (!entry.text.trim() || entry.text.length > 12000)) ||
        (own(entry,'author') && !validAuthor(entry.author)) ||
        (own(entry,'parent') && !seen.has(entry.parent)) ||
        (own(entry,'textFormat') && entry.textFormat !== 'markdown') ||
        (own(entry,'baseline') && entry.baseline !== true) ||
        Object.keys(entry).some(key=>!fields.includes(key))) throw new Error('Invalid '+kind+' in this discussion.')
    seen.add(entry.id)
  }
}

export function checkDiscussion(mark) {
  if (own(mark,'replies')) checkRecords(mark.replies,'reply')
  if (own(mark,'history')) {
    const h = mark.history
    if (!h || typeof h.enabled !== 'boolean' || Object.keys(h).some(key=>!['enabled','versions'].includes(key))) {
      throw new Error('Invalid note history.')
    }
    checkRecords(h.versions,'version')
  }
}

export function newEntry(text,author) {
  return {id:crypto.randomUUID(),at:new Date().toISOString(),text,...(author ? {author} : {})}
}
const sameBody = (a,b)=>a?.text === b?.text && a?.textFormat === b?.textFormat

// Capture the known text when tracking starts or resumes. The timestamp identifies
// the capture, since the original writing time and editor may be unknown.
export function saveHistory(current,edited,enabled,actor) {
  const old = current?.history
  if (!enabled) return old?.enabled ? {...old,enabled:false} : old
  const versions = [...(old?.versions ?? [])]
  function capture(mark,baseline) {
    const entry = newEntry(mark.text,actor)
    if (mark.textFormat) entry.textFormat = mark.textFormat
    if (baseline) entry.baseline = true
    versions.push(entry)
  }
  if (current && !old?.enabled && !sameBody(versions.at(-1),current)) capture(current,true)
  if (!current || !sameBody(current,edited)) capture(edited,false)
  if (old?.enabled && versions.length === old.versions.length) return old
  return {enabled:true,versions}
}

function equalEntry(a,b) {
  return Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(key=>a[key]===b[key])
}
function joinEntries(first = [], second = []) {
  const entries = new Map(first.map(item=>[item.id,item]))
  for (const item of second) {
    const prior = entries.get(item.id)
    if (prior && !equalEntry(prior,item)) throw new Error('Two discussion entries have the same ID but different contents.')
    entries.set(item.id,item)
  }
  return [...entries.values()]
}

// Keep both reviewers' entries during migration, even when importing an older file.
export function importDiscussion(local,incoming) {
  const merged = {...incoming}
  if (local.replies) merged.replies = joinEntries(local.replies,incoming.replies)
  if (local.history) merged.history = {enabled:incoming.history?.enabled ?? local.history.enabled,
    versions:joinEntries(local.history.versions,incoming.history?.versions)}
  return merged
}

function applyEntries(stored = [],before = [],after = []) {
  const nextIds = new Set(after.map(item=>item.id))
  const removed = new Set(before.filter(item=>!nextIds.has(item.id)).map(item=>item.id))
  const priorIds = new Set(before.map(item=>item.id))
  const retainedIds = new Set(stored.map(item=>item.id))
  const additions = new Set(after.filter(item=>!priorIds.has(item.id)).map(item=>item.id))
  // A concurrent undo can remove a parent while another editor is replying.
  // Carry its ancestor path with the new reply in either transaction order.
  for (let i=after.length-1;i>=0;i--) {
    const item=after[i]
    if (additions.has(item.id) && item.parent && !retainedIds.has(item.parent)) additions.add(item.parent)
  }
  const combined = joinEntries(stored,after.filter(item=>additions.has(item.id)))
  // Undoing a parent reply must keep the path to a concurrently saved child.
  for (let i=combined.length-1;i>=0;i--) {
    const item=combined[i]
    if (!removed.has(item.id) && item.parent) removed.delete(item.parent)
  }
  return combined.filter(item=>!removed.has(item.id))
}

export function applyDiscussionChanges(updated,prior,after) {
  if (prior.replies !== after.replies) {
    const replies = applyEntries(updated.replies,prior.replies,after.replies)
    if (replies.length) updated.replies = replies
    else delete updated.replies
  }
  if (prior.history !== after.history) {
    const versions = applyEntries(updated.history?.versions,prior.history?.versions,after.history?.versions)
    const enabled = prior.history?.enabled === after.history?.enabled ? updated.history?.enabled : after.history?.enabled
    if (versions.length) updated.history = {enabled:!!enabled,versions}
    else delete updated.history
  }
}

export function threadRows(replies = []) {
  const children = new Map()
  for (const entry of replies) {
    if (!children.has(entry.parent)) children.set(entry.parent,[])
    children.get(entry.parent).push(entry)
  }
  const rows = []
  function visit(parent,depth,parentNumber) {
    for (const entry of children.get(parent) ?? []) {
      rows.push({entry,depth,number:rows.length+1,parentNumber})
      visit(entry.id,depth+1,rows.length)
    }
  }
  visit(undefined,0)
  return rows
}
