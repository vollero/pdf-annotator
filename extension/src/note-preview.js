// Listen on the page stack because scrolling and zooming replace its SVG markers.
export function bindNotePreview(stack, preview, findNote, edit) {
  let marker, closeTimer

  function hide() {
    clearTimeout(closeTimer)
    marker?.removeAttribute('aria-describedby')
    marker = null
    preview.hidden = true
    preview.textContent = ''
  }

  function show(event) {
    const next = event.target.closest('.note-marker')
    if (!next || (event.type === 'pointerover' && (stack.dataset.tool !== 'select' || event.pointerType === 'touch'))) return
    clearTimeout(closeTimer)
    if (next === marker) return
    hide()
    const note = findNote(next.dataset.id)
    if (!note) return
    marker = next
    preview.textContent = note.text
    preview.hidden = false
    preview.scrollTop = 0
    const box = next.getBoundingClientRect()
    const {width, height} = preview.getBoundingClientRect()
    const top = box.bottom + 4 + height <= innerHeight - 8 ? box.bottom + 4 : box.top - height - 4
    preview.style.left = Math.max(8, Math.min(box.left, innerWidth - width - 8)) + 'px'
    preview.style.top = Math.max(8, Math.min(top, innerHeight - height - 8)) + 'px'
    next.setAttribute('aria-describedby',preview.id)
  }

  function leave(event) {
    if (!marker || marker.contains(event.relatedTarget) || preview.contains(event.relatedTarget)) return
    clearTimeout(closeTimer)
    closeTimer = setTimeout(() => {
      if (!marker?.matches(':hover, :focus') && !preview.matches(':hover')) hide()
    }, 160)
  }

  stack.addEventListener('pointerover',show)
  stack.addEventListener('focusin',show)
  stack.addEventListener('pointerout',leave)
  stack.addEventListener('focusout',leave)
  preview.addEventListener('pointerenter',() => clearTimeout(closeTimer))
  preview.addEventListener('pointerleave',leave)
  stack.addEventListener('keydown',event => {
    const target = event.target.closest('.note-marker')
    if (target && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault()
      edit(findNote(target.dataset.id))
    }
  })
  document.addEventListener('keydown',event => {
    if (event.key === 'Escape' && marker) {
      event.stopPropagation()
      hide()
    }
  }, true)
  stack.parentElement.addEventListener('scroll',hide,{passive:true})
  window.addEventListener('resize',hide)
  return hide
}
