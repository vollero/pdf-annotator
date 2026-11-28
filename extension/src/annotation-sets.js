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

// RC3 stored the original name as the membership key. Keep that key stable
// locally, including for edits that another tab started before a rename.
export function setLabel(view,key) {
  return view.labels && Object.hasOwn(view.labels,key) ? view.labels[key] : key
}

export function setView(names,view = initialSets) {
  const known = new Set([defaultSet,...names])
  const labels = names.filter(key=>setLabel(view,key)!==key).map(key=>[key,setLabel(view,key)])
  return {names,active:known.has(view.active) ? view.active : defaultSet,hidden:view.hidden.filter(name=>known.has(name)),
    ...(labels.length ? {labels:Object.fromEntries(labels)} : {})}
}

export function checkSetLabel(view,label,except) {
  if (label === defaultSet || view.names.some(key=>key!==except && setLabel(view,key)===label)) {
    throw new Error('Choose a name that this PDF does not already use.')
  }
  if (!validSetName(label)) throw new Error('Enter a set name of up to 64 characters on one line.')
}

export function renameSet(view,key,label) {
  if (!view.names.includes(key)) throw new Error('This named set is no longer in the document.')
  checkSetLabel(view,label,key)
  if (setLabel(view,key)===label) return view
  return setView(view.names,{...view,labels:{...view.labels,[key]:label}})
}

export function addNamedSet(view,label) {
  checkSetLabel(view,label)
  let key = label
  while (view.names.includes(key)) key = crypto.randomUUID()
  const names = [...view.names,key]
  return {key,view:setView(names,{...view,labels:{...view.labels,[key]:label}})}
}

export function importNamedSets(view,names,marks) {
  const keys = new Map(view.names.map(key=>[setLabel(view,key),key]))
  for (const name of names) {
    if (keys.has(name)) continue
    const added = addNamedSet(view,name)
    view = added.view
    keys.set(name,added.key)
  }
  return {view,marks:marks.map(mark=>mark.set && keys.get(mark.set)!==mark.set ? assignSet(mark,keys.get(mark.set)) : mark)}
}

export function exportSetMarks(view,marks) {
  if (!view.labels) return marks
  return marks.map(mark=>mark.set && setLabel(view,mark.set)!==mark.set ? assignSet(mark,setLabel(view,mark.set)) : mark)
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
  const labels = new Map(stored.names.filter(key=>names.includes(key)).map(key=>[key,setLabel(stored,key)]))
  const used = new Set(labels.values())
  for (const key of names) {
    const current = labels.get(key)
    const wanted = setLabel(after,key)
    if (current !== undefined && (!after.names.includes(key) || setLabel(before,key)===wanted || current===wanted)) continue
    // Keep a concurrently claimed name with its owner. A simultaneous new
    // set still needs its own usable label and must retain all its marks.
    if (current !== undefined && used.has(wanted)) continue
    let label = wanted
    for (let i=2; used.has(label); i++) {
      const suffix = ' ('+i+')'
      label = wanted.slice(0,64-suffix.length).trimEnd()+suffix
    }
    used.delete(current)
    used.add(label)
    labels.set(key,label)
  }
  return setView(names,{
    labels:Object.fromEntries(labels),
    active:before.active === after.active ? stored.active : after.active,
    hidden:mergeList(stored.hidden,before.hidden,after.hidden)
  })
}
