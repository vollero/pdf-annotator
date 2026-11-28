const defaults = [
  ['Amber','#efc650'], ['Sage','#9abd9e'], ['Sky','#91b9dd'], ['Rose','#e5a4ae'], ['Lavender','#b3a1d4']
]
const hexColor = /^#[0-9a-f]{6}$/

function fillOptions(select, colors, customLabel) {
  select.replaceChildren()
  for (const [label,value] of colors) select.add(new Option(label===value ? value : label+' ('+value+')',value))
  select.add(new Option(customLabel,''))
}

function bindColorInputs(form, onInput) {
  const picker = form.querySelector('input[type="color"]'), hex = form.querySelector('input[pattern]')
  const value = () => '#' + hex.value.replace(/^#/,'').toLowerCase()
  picker.oninput = picker.onchange = () => {
    hex.value = picker.value
    onInput(picker.value)
  }
  hex.oninput = () => {
    const color = value()
    if (hexColor.test(color)) picker.value = color
    onInput(color)
  }
  return {value, set:color=>{ picker.value = hex.value = color.toLowerCase() }}
}

export function bindPalette({privateWindow, preference, savePreference, notify}) {
  const byId = id => document.getElementById(id)
  const swatches = byId('color-swatches'), dialog = byId('palette-dialog'), form = byId('palette-form')
  const entries = byId('palette-entry'), name = byId('palette-name')
  const error = byId('palette-error'), remove = byId('palette-remove')
  const fields = bindColorInputs(form,()=>{ error.hidden = true })
  let colors = defaults, editingColors, active, original, memoryOnly = privateWindow

  function readColors() {
    if (memoryOnly) return colors
    try {
      const saved = JSON.parse(preference('palette', 'null'))
      if (Array.isArray(saved) && saved.length && saved.every(pair => Array.isArray(pair) && pair.length === 2 &&
          typeof pair[0] === 'string' && pair[0].length <= 40 && typeof pair[1] === 'string' && hexColor.test(pair[1])) &&
          new Set(saved.map(pair => pair[1])).size === saved.length) return saved
    } catch { /* Start with the bundled palette if the preference cannot be read. */ }
    return defaults
  }
  function paint() {
    const quick = colors.slice(0,5)
    if (!quick.some(([,value])=>value===active)) quick[4] = colors.find(([,value])=>value===active)
    swatches.replaceChildren(...quick.map(([label,value])=>{
      const button = document.createElement('button')
      button.className = 'swatch'
      button.title = label === value ? value : label + ' (' + value + ')'
      button.style.setProperty('--tone',value)
      button.setAttribute('aria-label',label+' annotation color')
      button.setAttribute('aria-pressed',String(value===active))
      button.onclick = () => {
        active = value
        if (!memoryOnly) savePreference('active-color',value)
        for (const other of swatches.children) other.setAttribute('aria-pressed',String(other===button))
      }
      return button
    }))
  }
  function load() {
    colors = readColors()
    const preferred = memoryOnly ? null : preference('active-color',null)
    active = [active,preferred].find(value=>colors.some(pair=>pair[1]===value)) ?? colors[0][1]
    paint()
  }
  function edit() {
    original = editingColors.find(([,value])=>value===entries.value)
    name.value = original?.[0] ?? ''
    fields.set(original?.[1] ?? '#176b87')
    remove.disabled = !original || editingColors.length===1
    error.hidden = true
  }
  function message(text) {
    error.textContent = text
    error.hidden = false
  }
  byId('edit-palette').onclick = () => {
    editingColors = colors
    fillOptions(entries,colors,'Add a color…')
    entries.value = active
    edit()
    dialog.showModal()
  }
  entries.onchange = edit

  async function commit(action) {
    const value = fields.value(), label = name.value.trim() || value
    const entry = original
    const apply = () => {
      if (!dialog.open) return
      const latest = readColors()
      let next, chosen
      if (action === 'reset') {
        next = defaults
        chosen = defaults[0][1]
      } else {
        if (entry && !latest.some(([title,v])=>v===entry[1] && title===entry[0])) {
          message('This color changed in another tab. Close the palette and open it again to see the latest colors.')
          return
        }
        const rest = latest.filter(([,v])=>v!==entry?.[1])
        if (action === 'remove') {
          if (!rest.length) { message('Keep at least one color in your palette.'); return }
          next = rest
          chosen = rest.some(([,v])=>v===active) ? active : rest[0][1]
        } else {
          if (rest.some(([,v])=>v===value)) { message('This color is already in your palette. Choose it under Saved colors.'); return }
          next = [[label,value],...rest]
          chosen = value
        }
      }
      if (!memoryOnly && !savePreference('palette',JSON.stringify(next))) {
        memoryOnly = true
        notify('Browser storage is unavailable. This palette will last until you close or reload this tab.')
      }
      colors = next
      active = chosen
      if (!memoryOnly) savePreference('active-color',active)
      paint()
      dialog.close()
    }
    if (memoryOnly) apply()
    else await navigator.locks.request('margin-edit-palette',apply)
  }
  form.onsubmit = event => { event.preventDefault(); commit('save') }
  remove.onclick = () => commit('remove')
  byId('palette-reset').onclick = () => commit('reset')
  window.addEventListener('storage',event=>{
    if (!memoryOnly && (!event.key || event.key==='margin.palette')) load()
  })
  load()

  const markDialog = byId('mark-color-dialog'), savedColors = byId('mark-color-entry')
  const selectMatchingColor = value => {
    savedColors.value = value
    if (savedColors.selectedIndex < 0) savedColors.value = ''
  }
  const markFields = bindColorInputs(markDialog,selectMatchingColor)
  savedColors.onchange = () => {
    if (savedColors.value) markFields.set(savedColors.value)
    else byId('mark-color-hex').select()
  }
  function chooseAnnotationColor(current) {
    fillOptions(savedColors,colors,'Custom color')
    markFields.set(current)
    selectMatchingColor(markFields.value())
    markDialog.returnValue = ''
    return new Promise(resolve=>{
      markDialog.addEventListener('close',()=>resolve(markDialog.returnValue==='apply' ? markFields.value() : null),{once:true})
      markDialog.showModal()
    })
  }
  return {getColor:()=>active,chooseAnnotationColor}
}
