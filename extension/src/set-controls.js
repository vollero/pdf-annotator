import { defaultSet, setLabel } from './annotation-sets.js'

export function bindSetControls({create,rename,archive,writeIn,showSet}) {
  const byId = id=>document.getElementById(id)
  const dialog = byId('sets-dialog'), trigger = byId('manage-sets')
  const active = byId('active-set'), list = byId('visible-sets'), name = byId('set-name')
  const form = byId('rename-set'), replacement = byId('rename-set-name')
  const archivedList = byId('archived-sets')
  let displayedNames, editing
  function endRename(focus = true) {
    const button = [...list.querySelectorAll('.set-rename')].find(item=>item.value===editing)
    editing = undefined
    form.hidden = true
    if (focus) (button ?? active).focus()
  }
  trigger.onclick = ()=>{
    endRename(false)
    name.value = ''
    name.setCustomValidity('')
    dialog.showModal()
  }
  active.onchange = ()=>writeIn(active.value)
  list.onchange = event=>showSet(event.target.value,event.target.checked)
  name.oninput = ()=>name.setCustomValidity('')
  byId('create-set').onsubmit = event=>{
    event.preventDefault()
    try {
      create(name.value.trim().normalize('NFC'))
      name.value = ''
      active.focus()
    } catch (error) {
      name.setCustomValidity(error.message)
      name.reportValidity()
    }
  }
  replacement.oninput = ()=>replacement.setCustomValidity('')
  form.onsubmit = event=>{
    event.preventDefault()
    try {
      rename(editing,replacement.value.trim().normalize('NFC'))
      endRename()
    } catch (error) {
      replacement.setCustomValidity(error.message)
      replacement.reportValidity()
    }
  }
  byId('cancel-rename').onclick = ()=>endRename()
  dialog.addEventListener('cancel',event=>{
    if (editing !== undefined) { event.preventDefault(); endRename() }
  })
  return view=>{
    trigger.disabled = false
    const status = byId('writing-set')
    status.hidden = !view.names.length && !view.hidden.length
    const hiddenCount = view.hidden.filter(key=>!view.archived?.includes(key)).length
    status.textContent = 'Writing in '+setLabel(view,view.active)+(hiddenCount ? ' · '+hiddenCount+' hidden' : '')+
      (view.archived?.length ? ' · '+view.archived.length+' archived' : '')
    const names = JSON.stringify([view.names,view.labels,view.archived])
    if (displayedNames !== names) {
      displayedNames = names
      const boxes = document.createDocumentFragment()
      const archivedRows = document.createDocumentFragment()
      active.replaceChildren()
      for (const key of [defaultSet,...view.names]) {
        const text = setLabel(view,key)
        const row = document.createElement('div')
        const archived = view.archived?.includes(key)
        let archiveButton
        if (key!==defaultSet) {
          archiveButton = document.createElement('button')
          archiveButton.type = 'button'
          archiveButton.className = 'text-button set-archive'
          archiveButton.textContent = archived ? 'Restore' : 'Archive'
          archiveButton.value = key
          archiveButton.setAttribute('aria-label',archiveButton.textContent+' '+text)
          archiveButton.onclick = ()=>{
            archive(key,!archived)
            const target = archived ? list : archivedList
            const next = [...target.querySelectorAll('.set-archive')].find(item=>item.value===key)
            next?.focus()
          }
        }
        if (archived) {
          row.append(text,archiveButton)
          archivedRows.append(row)
          continue
        }
        active.add(new Option(text,key))
        const label = document.createElement('label'), box = document.createElement('input')
        label.className = 'check-label'
        box.type = 'checkbox'
        box.value = key
        label.append(box,text)
        row.append(label)
        if (key!==defaultSet) {
          const button = document.createElement('button')
          button.type = 'button'
          button.className = 'text-button set-rename'
          button.textContent = 'Rename'
          button.value = key
          button.setAttribute('aria-label','Rename '+text)
          button.onclick = ()=>{
            editing = key
            replacement.labels[0].textContent = 'New name for '+text
            replacement.value = text
            replacement.setCustomValidity('')
            form.hidden = false
            replacement.focus()
            replacement.select()
          }
          row.append(button,archiveButton)
        }
        boxes.append(row)
      }
      list.replaceChildren(boxes)
      archivedList.replaceChildren(archivedRows)
      byId('archived-sets-wrap').hidden = !view.archived?.length
      if (editing !== undefined) {
        if (view.names.includes(editing) && !view.archived?.includes(editing)) replacement.labels[0].textContent = 'New name for '+setLabel(view,editing)
        else endRename()
      }
    }
    active.value = view.active
    for (const box of list.querySelectorAll('input')) box.checked = !view.hidden.includes(box.value)
  }
}
