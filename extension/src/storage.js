import { checkMarkBudget } from './mark-data.js'

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
    let marks
    lookup.onsuccess = () => {
      marks = lookup.result ?? initialMarks
      if (lookup.result === undefined) {
        tx.objectStore('documents').put(file, file.id)
        drafts.put(marks, file.id)
      }
      tx.objectStore('settings').put(file.id, 'last')
    }
    tx.oncomplete = () => resolve(marks)
    tx.onabort = () => reject(tx.error)
  })
}

export const readMarks = id => read('drafts', id)

// Merge individual changes in one transaction so separate tabs can add marks safely.
export async function writeChanges(id, before, after) {
  const old = new Map(before.map(mark => [mark.id, mark]))
  const next = new Map(after.map(mark => [mark.id, mark]))
  const removed = before.filter(mark => !next.has(mark.id))
  const changed = after.filter(mark => old.get(mark.id) !== mark)
  const db = await database()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('drafts', 'readwrite')
    const store = tx.objectStore('drafts')
    const lookup = store.get(id)
    lookup.onsuccess = () => {
      const merged = new Map((lookup.result ?? before).map(mark => [mark.id,mark]))
      for (const mark of removed) merged.delete(mark.id)
      for (const mark of changed) {
        const prior = old.get(mark.id), latest = merged.get(mark.id)
        // Text, checkbox and style edits can land in different tabs before either receives the broadcast.
        if (latest?.type === mark.type && prior?.type === mark.type && mark.rects === prior.rects && mark.points === prior.points &&
            mark.point === prior.point && mark.passages === prior.passages && mark.page === prior.page && mark.color === prior.color) {
          const updated = {...latest}
          if (prior.text !== mark.text) updated.text = mark.text
          if (prior.done !== mark.done) {
            if (mark.done === undefined) delete updated.done
            else updated.done = mark.done
          }
          if (prior.style !== mark.style) {
            if (mark.style === undefined) delete updated.style
            else updated.style = mark.style
          }
          merged.set(mark.id,updated)
        } else merged.set(mark.id,mark)
      }
      const result = [...merged.values()]
      // Concurrent imports can each fit the limit on their own.
      try { checkMarkBudget(result) }
      catch (error) { tx.abort(); reject(error); return }
      store.put(result, id)
    }
    tx.oncomplete = resolve
    tx.onabort = () => reject(tx.error)
  })
}
