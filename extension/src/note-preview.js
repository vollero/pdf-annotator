import { titles } from './annotations.js'
import { isNote, noteStatus } from './mark-data.js'
import { renderNoteText } from './note-format.js'

// Listen on the page stack because scrolling and zooming replace its SVG markers.
export function bindNotePreview(stack, preview, findNote, edit) {
  const scroller = stack.parentElement
  const body = preview.querySelector('#preview-text'), source = preview.querySelector('#preview-source')
  const button = preview.querySelector('#preview-pin')
  let marker, pinnedId = null, closeTimer
  let displayed
  const redraws = new MutationObserver(() => {
    if (marker && !marker.isConnected) hideHover()
  })

  function releaseMarker() {
    clearTimeout(closeTimer)
    redraws.disconnect()
    marker?.removeAttribute('aria-describedby')
    marker = null
  }
  function clear() {
    releaseMarker()
    pinnedId = null
    if (preview.contains(document.activeElement)) scroller.focus({preventScroll:true})
    preview.hidden = true
    body.textContent = ''
    displayed = null
    source.textContent = ''
  }
  function hideHover() {
    if (marker) clear()
  }
  function render(note) {
    const pinned = pinnedId !== null
    const last = note.passages?.at(-1)?.page ?? note.page
    source.textContent = titles[note.type] + ' · ' + (note.page === last ? 'Page '+note.page : 'Pages '+note.page+'–'+last)
    if (displayed !== note) {
      renderNoteText(body,note,noteStatus(note))
      displayed = note
    }
    body.setAttribute('role',pinned ? 'note' : 'tooltip')
    button.querySelector('span').textContent = pinned ? 'Unpin preview' : 'Pin preview'
    preview.setAttribute('aria-label',pinned ? 'Pinned note preview' : 'Note preview')
    preview.style.setProperty('--tone',note.color)
    preview.classList.toggle('pinned',pinned)
    preview.hidden = false
  }
  function togglePin(id) {
    if (pinnedId === id) { clear(); return }
    const note = findNote(id)
    if (!note || !isNote(note)) return
    const keepScroll = marker?.dataset.id === id
    releaseMarker()
    pinnedId = id
    preview.style.removeProperty('left')
    preview.style.removeProperty('top')
    render(note)
    if (!keepScroll) body.scrollTop = 0
  }
  function refresh() {
    if (pinnedId === null) { hideHover(); return }
    const note = findNote(pinnedId)
    if (note && isNote(note)) render(note)
    else clear()
  }

  function show(event) {
    if (pinnedId !== null) return
    const next = event.target.closest('.note-marker')
    if (next?.classList.contains('expanded-note')) { hideHover(); return }
    if (!next || (event.type === 'pointerover' && (stack.dataset.tool !== 'select' || event.pointerType === 'touch'))) return
    clearTimeout(closeTimer)
    if (next === marker) return
    hideHover()
    const note = findNote(next.dataset.id)
    if (!note) return
    marker = next
    redraws.observe(stack, {childList:true, subtree:true})
    render(note)
    body.scrollTop = 0
    const box = next.getBoundingClientRect()
    const {width, height} = preview.getBoundingClientRect()
    const top = box.bottom + 4 + height <= innerHeight - 8 ? box.bottom + 4 : box.top - height - 4
    preview.style.left = Math.max(8, Math.min(box.left, innerWidth - width - 8)) + 'px'
    preview.style.top = Math.max(8, Math.min(top, innerHeight - height - 8)) + 'px'
    next.setAttribute('aria-describedby',body.id)
  }

  function leave(event) {
    if (!marker || marker.contains(event.relatedTarget) || preview.contains(event.relatedTarget)) return
    clearTimeout(closeTimer)
    closeTimer = setTimeout(() => {
      if (!marker?.matches(':hover, :focus') && !preview.matches(':hover, :focus-within')) hideHover()
    }, 160)
  }

  stack.addEventListener('pointerover',show)
  stack.addEventListener('focusin',show)
  stack.addEventListener('pointerout',leave)
  stack.addEventListener('focusout',leave)
  preview.addEventListener('pointerenter',() => clearTimeout(closeTimer))
  preview.addEventListener('pointerleave',leave)
  preview.addEventListener('focusout',leave)
  button.onclick = () => togglePin(pinnedId ?? marker?.dataset.id)
  stack.addEventListener('keydown',event => {
    const target = event.target.closest('.note-marker')
    if (!target) return
    if (event.key.toLowerCase()==='p' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.repeat) {
      event.preventDefault()
      togglePin(target.dataset.id)
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      edit(findNote(target.dataset.id))
    }
  })
  document.addEventListener('keydown',event => {
    if (event.key === 'Escape' && !preview.hidden && !document.querySelector('dialog[open], .card-menu') &&
        !event.target.closest('input,textarea,select,[contenteditable="true"]')) {
      event.stopPropagation()
      clear()
    }
  }, true)
  scroller.addEventListener('scroll',hideHover,{passive:true})
  window.addEventListener('resize',hideHover)
  return {hideHover,clear,refresh,togglePin,get pinnedId() { return pinnedId }}
}
