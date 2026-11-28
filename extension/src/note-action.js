// A linked note needs separate keyboard targets for its action and its links.
export function wrapNoteAction(content, label, activate) {
  const button = document.createElement('button')
  button.type = 'button'
  if (!content.querySelector('a')) {
    button.append(content)
    button.onclick = activate
    return {element:button,button}
  }
  const element = document.createElement('div')
  button.className = 'note-action'
  button.setAttribute('aria-label',label)
  element.append(button,content)
  element.onclick = event => {
    if (event.target.closest('a')) return
    button.focus({preventScroll:true})
    activate()
  }
  return {element,button}
}
