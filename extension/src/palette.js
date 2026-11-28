const defaults = [
  ['Amber','#efc650'], ['Sage','#9abd9e'], ['Sky','#91b9dd'], ['Rose','#e5a4ae'], ['Lavender','#b3a1d4']
]
const hexColor = /^#[0-9a-f]{6}$/

export function bindPalette({privateWindow, preference, savePreference, notify}) {
  const byId = id => document.getElementById(id)
  const swatches = byId('color-swatches'), dialog = byId('palette-dialog'), form = byId('palette-form')
  const entries = byId('palette-entry'), name = byId('palette-name'), picker = byId('palette-picker')
  const hex = byId('palette-hex'), error = byId('palette-error'), remove = byId('palette-remove')
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
    picker.value = hex.value = original?.[1] ?? '#176b87'
    remove.disabled = !original || editingColors.length===1
    error.hidden = true
  }
  function message(text) {
    error.textContent = text
    error.hidden = false
  }
  byId('edit-palette').onclick = () => {
    editingColors = colors
    entries.replaceChildren(...colors.map(([label,value])=>new Option(label===value ? value : label+' ('+value+')',value)),
      new Option('Add a color…',''))
    entries.value = active
    edit()
    dialog.showModal()
  }
  entries.onchange = edit
  picker.oninput = picker.onchange = () => { hex.value = picker.value; error.hidden = true }
  hex.oninput = () => {
    const value = '#' + hex.value.trim().replace(/^#/,'').toLowerCase()
    if (hexColor.test(value)) picker.value = value
    error.hidden = true
  }

  async function commit(action) {
    const value = '#' + hex.value.replace(/^#/,'').toLowerCase(), label = name.value.trim() || value
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
  return () => active
}
