import { noteStatus } from './mark-data.js'
import { readableNoteText, renderNoteText } from './note-format.js'
import { wrapNoteAction } from './note-action.js'

export function indexMarginNotes(marks) {
  const pages = new Map()
  for (const mark of marks) {
    if (!mark.marginSide) continue
    for (const part of mark.passages ?? [mark]) {
      let sides = pages.get(part.page)
      if (!sides) pages.set(part.page, sides = {left:[], right:[]})
      const y = part.point?.[1] ?? part.rects[0][1]
      sides[mark.marginSide].push({mark, y})
    }
  }
  return pages
}

// Make room for neighbouring cards, including at the bottom edge of the page.
function positionCards(rail, entries) {
  const gap = 6
  const height = rail.clientHeight
  const heights = entries.map(({element}) => element.offsetHeight)
  const tops = []
  let bottom = 0
  for (let i = 0; i < entries.length; i++) {
    tops[i] = Math.max(bottom, entries[i].y * height)
    bottom = tops[i] + heights[i] + gap
  }
  bottom = Math.max(height, heights.reduce((total,h) => total + h, 0) + gap * (entries.length - 1))
  for (let i = entries.length - 1; i >= 0; i--) {
    const top = Math.min(tops[i], bottom - heights[i])
    entries[i].element.style.top = top + 'px'
    bottom = top - gap
  }
}

export function clearMargins(sheet) {
  for (const {rail,observer} of sheet.rails ?? []) {
    observer.disconnect()
    rail.remove()
  }
  sheet.rails = undefined
  sheet.marginEntries = undefined
}

export function showMargins(sheet, sides, edit) {
  if (sides === sheet.marginEntries) return
  clearMargins(sheet)
  if (!sides) return
  sheet.marginEntries = sides
  sheet.rails = []
  for (const [side, notes] of Object.entries(sides)) {
    if (!notes.length) continue
    const rail = document.createElement('div')
    rail.className = 'margin-rail ' + side
    rail.setAttribute('role','group')
    rail.setAttribute('aria-label',(side === 'left' ? 'Left' : 'Right') + ' margin on page ' + sheet.number)
    const entries = notes.slice().sort((a,b) => a.y - b.y).map(({mark,y}) => {
      const content = document.createElement('span')
      const status = noteStatus(mark)
      renderNoteText(content,mark,status)
      const label = 'Edit margin note'
      const {element,button} = wrapNoteAction(content,label,()=>edit(mark,sheet))
      element.className = 'margin-note'
      element.dataset.id = mark.id
      element.style.setProperty('--tone',mark.color)
      button.setAttribute('aria-haspopup','dialog')
      button.title = label
      if (element === button && content.querySelector('math')) {
        button.setAttribute('aria-label',(status ? status+' · ' : '')+readableNoteText(mark))
      }
      rail.append(element)
      return {element,y}
    })
    sheet.row.append(rail)
    positionCards(rail, entries)
    const observer = new ResizeObserver(() => positionCards(rail, entries))
    observer.observe(rail)
    for (const {element} of entries) observer.observe(element)
    sheet.rails.push({rail,observer})
  }
}
