export function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) &&
    new Date(value).toJSON() === value
}

export function validMarkDates(mark) {
  return (!Object.hasOwn(mark,'createdAt') || validDate(mark.createdAt)) &&
    (!Object.hasOwn(mark,'updatedAt') || validDate(mark.updatedAt)) &&
    !(mark.updatedAt < mark.createdAt)
}

// Assign dates at the user edit, so exports and private sessions see the same dates as storage.
export function dateEdits(before,after,at=new Date().toISOString()) {
  const prior = new Map(before.map(mark=>[mark.id,mark]))
  return after.map(mark=>{
    const old = prior.get(mark.id)
    if (old === mark) return mark
    if (!old) return {...mark,createdAt:at,updatedAt:at}
    if (JSON.stringify(old) === JSON.stringify(mark)) return old
    return {...mark,updatedAt:[old.createdAt,old.updatedAt,at].filter(Boolean).sort().at(-1)}
  })
}

// A legacy import can supply the current wording without knowing when it was written.
export function importDates(local,incoming) {
  const mark = {...incoming}
  if (local.createdAt && (!mark.createdAt || local.createdAt < mark.createdAt)) mark.createdAt = local.createdAt
  if (!mark.updatedAt && local.updatedAt) {
    const body = ({createdAt,updatedAt,...content})=>JSON.stringify(content)
    if (!(local.updatedAt < mark.createdAt) && body(local) === body(incoming)) mark.updatedAt = local.updatedAt
  }
  return mark
}

// Undo restores the dates from its snapshot. If another tab edited in between,
// retain the latest known time across both changes.
export function mergeDates(result,stored,before,after) {
  if (!before || !stored) return
  for (const key of ['createdAt','updatedAt']) {
    if (stored[key] === before[key]) {
      if (after[key]) result[key] = after[key]
      else delete result[key]
    } else {
      const dates = [stored[key],after[key]].filter(Boolean).sort()
      if (dates.length) result[key] = key === 'createdAt' ? dates[0] : dates.at(-1)
    }
  }
  if (result.updatedAt < result.createdAt) result.updatedAt = result.createdAt
}

export function annotationEvents(marks) {
  const events = []
  for (const mark of marks) {
    for (const version of mark.history?.versions ?? []) events.push({at:version.at,kind:version.baseline ? 'Text captured' : 'Version saved',mark,entry:version})
    for (const reply of mark.replies ?? []) events.push({at:reply.at,kind:'Reply',mark,entry:reply})
    if (mark.createdAt) events.push({at:mark.createdAt,kind:'Created',mark})
    if (mark.updatedAt && mark.updatedAt !== mark.createdAt) events.push({at:mark.updatedAt,kind:'Last edited',mark})
  }
  return events.sort((a,b)=>a.at.localeCompare(b.at) || a.mark.page-b.mark.page)
}

const format = new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'medium'})
export const localDateTime = at=>format.format(new Date(at))

export function dateLine(mark) {
  const line = document.createElement('p')
  line.className = 'annotation-dates'
  function append(label,at) {
    if (line.childNodes.length) line.append(' · ')
    line.append(label+' ')
    if (!at) { line.append('unknown'); return }
    const time = document.createElement('time')
    time.dateTime = at
    time.textContent = localDateTime(at)
    time.title = at
    line.append(time)
  }
  append('Created',mark.createdAt)
  if (mark.updatedAt && mark.updatedAt !== mark.createdAt) append('Edited',mark.updatedAt)
  return line
}
