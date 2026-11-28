import { defaultSet } from './annotation-sets.js'

export function bindSetControls({create,writeIn,showSet}) {
  const byId = id=>document.getElementById(id)
  const dialog = byId('sets-dialog'), trigger = byId('manage-sets')
  const active = byId('active-set'), list = byId('visible-sets'), name = byId('set-name')
  let displayedNames
  trigger.onclick = ()=>{
    name.value = ''
    name.setCustomValidity('')
    dialog.showModal()
  }
  active.onchange = ()=>writeIn(active.value)
  list.onchange = event=>showSet(event.target.value,event.target.checked)
  name.oninput = ()=>name.setCustomValidity('')
  byId('create-set').onsubmit = event=>{
    event.preventDefault()
    const error = create(name.value.trim().normalize('NFC'))
    if (error) {
      name.setCustomValidity(error)
      name.reportValidity()
    } else {
      name.value = ''
      active.focus()
    }
  }
  return view=>{
    trigger.disabled = false
    const status = byId('writing-set')
    status.hidden = !view.names.length && !view.hidden.length
    status.textContent = 'Writing in '+view.active+(view.hidden.length ? ' · '+view.hidden.length+' hidden' : '')
    if (displayedNames !== JSON.stringify(view.names)) {
      displayedNames = JSON.stringify(view.names)
      const boxes = document.createDocumentFragment()
      active.replaceChildren()
      for (const set of [defaultSet,...view.names]) {
        active.add(new Option(set,set))
        const label = document.createElement('label'), box = document.createElement('input')
        label.className = 'check-label'
        box.type = 'checkbox'
        box.value = set
        label.append(box,set)
        boxes.append(label)
      }
      list.replaceChildren(boxes)
    }
    active.value = view.active
    for (const box of list.querySelectorAll('input')) box.checked = !view.hidden.includes(box.value)
  }
}
