import { defaultSet, setLabel } from './annotation-sets.js'

export function bindSetControls({create,rename,writeIn,showSet}) {
  const byId = id=>document.getElementById(id)
  const dialog = byId('sets-dialog'), trigger = byId('manage-sets')
  const active = byId('active-set'), list = byId('visible-sets'), name = byId('set-name')
  const form = byId('rename-set'), replacement = byId('rename-set-name')
  let displayedNames, editing
  function endRename(focus = true) {
    const button = [...list.querySelectorAll('button')].find(item=>item.value===editing)
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
    status.textContent = 'Writing in '+setLabel(view,view.active)+(view.hidden.length ? ' · '+view.hidden.length+' hidden' : '')
    const names = JSON.stringify([view.names,view.labels])
    if (displayedNames !== names) {
      displayedNames = names
      const boxes = document.createDocumentFragment()
      active.replaceChildren()
      for (const key of [defaultSet,...view.names]) {
        const text = setLabel(view,key)
        active.add(new Option(text,key))
        const row = document.createElement('div')
        const label = document.createElement('label'), box = document.createElement('input')
        label.className = 'check-label'
        box.type = 'checkbox'
        box.value = key
        label.append(box,text)
        row.append(label)
        if (key!==defaultSet) {
          const button = document.createElement('button')
          button.type = 'button'
          button.className = 'text-button'
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
          row.append(button)
        }
        boxes.append(row)
      }
      list.replaceChildren(boxes)
      if (editing !== undefined) {
        if (view.names.includes(editing)) replacement.labels[0].textContent = 'New name for '+setLabel(view,editing)
        else endRename()
      }
    }
    active.value = view.active
    for (const box of list.querySelectorAll('input')) box.checked = !view.hidden.includes(box.value)
  }
}
