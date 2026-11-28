export const defaultSet = 'My notes'
export const maxNamedSets = 128
export const initialSets = {names:[],active:defaultSet,hidden:[]}

export function validSetName(name) {
  return typeof name === 'string' && name.length > 0 && name.length <= 64 &&
    name === name.trim().normalize('NFC') && !/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(name) && name !== defaultSet
}

export function setNames(names,marks) {
  const all = new Set(names)
  for (const mark of marks) if (mark.set !== undefined) all.add(mark.set)
  if (all.size > maxNamedSets || [...all].some(name=>!validSetName(name))) {
    throw new Error('An annotation set needs a name of up to 64 characters. Each PDF can have up to 128 named sets.')
  }
  return [...all]
}

export function setView(names,view = initialSets) {
  const known = new Set([defaultSet,...names])
  return {names,active:known.has(view.active) ? view.active : defaultSet,hidden:view.hidden.filter(name=>known.has(name))}
}

export function assignSet(mark,name) {
  const assigned = {...mark}
  if (name === defaultSet) delete assigned.set
  else assigned.set = name
  return assigned
}

export function visibleMarks(marks,view) {
  if (!view.hidden.length) return marks
  const hidden = new Set(view.hidden)
  return marks.filter(mark=>!hidden.has(mark.set ?? defaultSet))
}

// Apply only this tab's additions/removals to the latest stored list.
function mergeList(stored,before,after) {
  const values = new Set(stored)
  for (const name of before) if (!after.includes(name)) values.delete(name)
  for (const name of after) if (!before.includes(name)) values.add(name)
  return [...values]
}

export function mergeSetViews(stored,before,after,marks) {
  const names = setNames(mergeList(stored.names,before.names,after.names),marks)
  return setView(names,{
    active:before.active === after.active ? stored.active : after.active,
    hidden:mergeList(stored.hidden,before.hidden,after.hidden)
  })
}
