import { mergeDates } from './annotation-dates.js'
import { checkMarkBudget, compatibleMarkTypes, isNote } from './mark-data.js'
import { initialSets, mergeSetViews } from './annotation-sets.js'
import { applyDiscussionChanges, importDiscussion } from './discussion.js'
import { mergeTags } from './comment-details.js'

let connection
function database() {
  if (!connection) connection = new Promise((resolve, reject) => {
    const request = indexedDB.open('margin-workspace', 1)
    request.onupgradeneeded = () => {
      for (const name of ['documents', 'drafts', 'settings']) request.result.createObjectStore(name)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => { connection = undefined; reject(request.error) }
  })
  return connection
}

async function read(store, key) {
  const db = await database()
  return new Promise((resolve, reject) => {
    const req = db.transaction(store).objectStore(store).get(key)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function lastDocument() {
  const id = await read('settings', 'last')
  return id ? read('documents', id) : undefined
}

export async function remember(file, initialMarks) {
  const db = await database()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['documents','drafts','settings'], 'readwrite')
    const drafts = tx.objectStore('drafts')
    const lookup = drafts.get(file.id)
    const sets = tx.objectStore('settings').get(['sets',file.id])
    let marks
    lookup.onsuccess = () => {
      marks = lookup.result ?? initialMarks
      if (lookup.result === undefined) {
        tx.objectStore('documents').put(file, file.id)
        drafts.put(marks, file.id)
      }
      tx.objectStore('settings').put(file.id, 'last')
    }
    tx.oncomplete = () => resolve({marks,sets:sets.result ?? initialSets})
    tx.onabort = () => reject(tx.error)
  })
}

export const readMarks = id => read('drafts', id)

export async function readWorkspace(id) {
  const db = await database()
  return new Promise((resolve,reject)=>{
    const tx = db.transaction(['drafts','settings'])
    const marks = tx.objectStore('drafts').get(id)
    const sets = tx.objectStore('settings').get(['sets',id])
    tx.oncomplete = ()=>resolve({marks:marks.result,sets:sets.result ?? initialSets})
    tx.onabort = ()=>reject(tx.error)
  })
}

// Merge individual changes in one transaction so separate tabs can add marks safely.
export async function writeChanges(id, before, after, beforeSets = initialSets, afterSets = initialSets) {
  const old = new Map(before.map(mark => [mark.id, mark]))
  const next = new Map(after.map(mark => [mark.id, mark]))
  const removed = before.filter(mark => !next.has(mark.id))
  const changed = after.filter(mark => old.get(mark.id) !== mark)
  const db = await database()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['drafts','settings'], 'readwrite')
    const store = tx.objectStore('drafts')
    const lookup = store.get(id)
    const settings = tx.objectStore('settings')
    const currentSets = settings.get(['sets',id])
    const timeline = settings.get(['timeline',id])
    let savedSets, concurrent
    timeline.onsuccess = () => {
      try { save() } catch (error) { tx.abort(); reject(error) }
    }
    function save() {
      const merged = new Map((lookup.result ?? before).map(mark => [mark.id,mark]))
      for (const mark of removed) merged.delete(mark.id)
      for (const mark of changed) {
        const prior = old.get(mark.id), latest = merged.get(mark.id)
        // Merge field edits independently when tabs change the same annotation before receiving a broadcast.
        if (compatibleMarkTypes(prior,mark) && mark.rects === prior.rects && mark.points === prior.points &&
            mark.passages === prior.passages && mark.page === prior.page) {
          if (!compatibleMarkTypes(latest,mark)) continue
          const updated = {...latest}
          const converted = prior.type !== mark.type
          if (converted) {
            if (latest.page !== mark.page) continue
            updated.type = mark.type
          }
          // An edit started before conversion may still update the shared fields below.
          if (updated.type === mark.type && mark.point) {
            if (mark.point[0] !== prior.point[0] || mark.point[1] !== prior.point[1]) updated.point = mark.point
            if (converted || mark.size?.[0] !== prior.size?.[0] || mark.size?.[1] !== prior.size?.[1]) {
              if (mark.size) updated.size = mark.size
              else delete updated.size
            }
          }
          // A move and a resize in separate tabs can each fit, but cross the page edge together.
          if (updated.type === 'region') {
            updated.point = updated.point.map((v,i)=>Math.min(v,1-updated.size[i]))
          }
          if (prior.text !== mark.text && (updated.type !== 'region' || mark.text.trim())) updated.text = mark.text
          if (converted && updated.type === 'region' && !updated.text.trim()) updated.text = mark.text
          if (prior.color !== mark.color) updated.color = mark.color
          if (prior.author !== mark.author) {
            if (mark.author) updated.author = mark.author
            else delete updated.author
          }
          if (prior.tags !== mark.tags) {
            const tags = mergeTags(latest.tags,prior.tags,mark.tags)
            if (tags.length) updated.tags = tags
            else delete updated.tags
          }
          if (prior.set !== mark.set) {
            if (mark.set) updated.set = mark.set
            else delete updated.set
          }
          if (prior.textFormat !== mark.textFormat) {
            if (mark.textFormat) updated.textFormat = mark.textFormat
            else delete updated.textFormat
          }
          if (prior.marginSide !== mark.marginSide) {
            if (mark.marginSide) updated.marginSide = mark.marginSide
            else delete updated.marginSide
          }
          if (prior.done !== mark.done) {
            if (mark.done === undefined) delete updated.done
            else updated.done = mark.done
          }
          if (prior.style !== mark.style) {
            if (mark.style === undefined) delete updated.style
            else updated.style = mark.style
          }
          applyDiscussionChanges(updated,prior,mark)
          mergeDates(updated,latest,prior,mark)
          merged.set(mark.id,updated)
        } else if (latest && isNote(mark) && (latest.history || latest.replies)) {
          if (prior) {
            const updated = {...mark}
            delete updated.history
            delete updated.replies
            if (latest.replies) updated.replies = latest.replies
            if (latest.history) updated.history = latest.history
            applyDiscussionChanges(updated,prior,mark)
            mergeDates(updated,latest,prior,mark)
            merged.set(mark.id,updated)
          } else merged.set(mark.id,importDiscussion(latest,mark))
        } else {
          const updated = {...mark}
          mergeDates(updated,latest,prior,mark)
          merged.set(mark.id,updated)
        }
      }
      const result = [...merged.values()]
      // Concurrent imports can each fit the limit on their own.
      checkMarkBudget(result)
      const previousMarks = lookup.result ?? before, previousSets = currentSets.result ?? beforeSets
      savedSets = mergeSetViews(previousSets,beforeSets,afterSets,result)
      const serialized = JSON.stringify(result)
      concurrent = serialized !== JSON.stringify(after) || JSON.stringify(savedSets) !== JSON.stringify(afterSets)
      if (serialized !== JSON.stringify(previousMarks) || ['names','labels','archived'].some(
        key=>JSON.stringify(savedSets[key]) !== JSON.stringify(previousSets[key]))) {
        putRecovery(settings,id,previousMarks,previousSets)
        recordSnapshot(settings,id,timeline.result,result,savedSets,serialized)
      }
      settings.put(savedSets,['sets',id])
      store.put(result,id)
    }
    tx.oncomplete = ()=>resolve({savedSets,concurrent})
    tx.onabort = () => reject(tx.error)
  })
}

function putRecovery(settings,id,marks,sets) {
  settings.put({token:crypto.randomUUID(),at:new Date().toISOString(),marks,sets},['previous-draft',id])
}

export async function recoverySummary(id) {
  const copy = await read('settings',['previous-draft',id])
  return copy && {token:copy.token,at:copy.at,count:copy.marks.length}
}

// Check the preview token and swap both complete drafts under the same write lock.
export async function restorePrevious(id,token) {
  const db = await database()
  return new Promise((resolve,reject)=>{
    const tx = db.transaction(['drafts','settings'],'readwrite')
    const drafts = tx.objectStore('drafts'), settings = tx.objectStore('settings')
    const current = drafts.get(id), sets = settings.get(['sets',id])
    const backup = settings.get(['previous-draft',id])
    const timeline = settings.get(['timeline',id])
    timeline.onsuccess = ()=>{
      if (!backup.result || backup.result.token !== token) {
        tx.abort()
        reject(new Error('The recovery copy changed. Open Restore previous draft again to review it.'))
        return
      }
      putRecovery(settings,id,current.result,sets.result ?? initialSets)
      recordSnapshot(settings,id,timeline.result,backup.result.marks,backup.result.sets)
      drafts.put(backup.result.marks,id)
      settings.put(backup.result.sets,['sets',id])
    }
    tx.oncomplete = ()=>resolve()
    tx.onabort = ()=>reject(tx.error)
  })
}

// Individual snapshots let the timeline read one draft at a time. The index,
// retention and workspace change all commit under the same IndexedDB write lock.
const emptyTimeline = {enabled:false,entries:[]}
export async function timelineIndex(id) {
  return await read('settings',['timeline',id]) ?? emptyTimeline
}
export const timelineSnapshot = (id,key)=>read('settings',['snapshot',id,key])

function recordSnapshot(settings,id,index,marks,sets,serialized) {
  if (!index?.enabled) return
  const last = index.entries.at(-1)
  const at = new Date().toISOString()
  const entry = {key:crypto.randomUUID(),at:last && last.at>at ? last.at : at,
    units:(serialized ?? JSON.stringify(marks)).length+JSON.stringify(sets).length}
  const entries = [...index.entries,entry]
  let units = entries.reduce((total,item)=>total+item.units,0)
  // Keep at most 50 states and 8 million serialized UTF-16 units per PDF.
  while (entries.length>1 && (entries.length>50 || units>8_000_000)) {
    const removed = entries.shift()
    settings.delete(['snapshot',id,removed.key])
    units -= removed.units
  }
  settings.put({marks,sets},['snapshot',id,entry.key])
  settings.put({enabled:true,entries},['timeline',id])
}

export async function setTimelineRecording(id,enabled) {
  const db = await database()
  return new Promise((resolve,reject)=>{
    const tx = db.transaction(['drafts','settings'],'readwrite')
    const settings = tx.objectStore('settings')
    const marks = tx.objectStore('drafts').get(id)
    const sets = settings.get(['sets',id])
    const lookup = settings.get(['timeline',id])
    lookup.onsuccess = ()=>{
      const index = lookup.result ?? emptyTimeline
      if (enabled === index.enabled) return
      if (enabled) recordSnapshot(settings,id,{...index,enabled},marks.result ?? [],sets.result ?? initialSets)
      else settings.put({...index,enabled},['timeline',id])
    }
    tx.oncomplete = resolve
    tx.onabort = ()=>reject(tx.error)
  })
}

export async function clearTimeline(id) {
  const db = await database()
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('settings','readwrite'), settings=tx.objectStore('settings')
    const lookup=settings.get(['timeline',id])
    lookup.onsuccess=()=>{
      for (const entry of lookup.result?.entries ?? []) settings.delete(['snapshot',id,entry.key])
      settings.delete(['timeline',id])
    }
    tx.oncomplete=resolve
    tx.onabort=()=>reject(tx.error)
  })
}
