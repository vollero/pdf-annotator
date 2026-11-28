import { noteStatus } from './mark-data.js'
import { renderNoteText } from './note-format.js'

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
  const heights = entries.map(({button}) => button.offsetHeight)
  const tops = []
  let bottom = 0
  for (let i = 0; i < entries.length; i++) {
    tops[i] = Math.max(bottom, entries[i].y * height)
    bottom = tops[i] + heights[i] + gap
  }
  bottom = Math.max(height, heights.reduce((total,h) => total + h, 0) + gap * (entries.length - 1))
  for (let i = entries.length - 1; i >= 0; i--) {
    const top = Math.min(tops[i], bottom - heights[i])
    entries[i].button.style.top = top + 'px'
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
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'margin-note'
      button.dataset.id = mark.id
      button.style.setProperty('--tone',mark.color)
      button.setAttribute('aria-haspopup','dialog')
      button.title = 'Edit margin note'
      const content = document.createElement('span')
      renderNoteText(content,mark,noteStatus(mark))
      button.append(content)
      button.onclick = () => edit(mark, sheet)
      rail.append(button)
      return {button,y}
    })
    sheet.row.append(rail)
    positionCards(rail, entries)
    const observer = new ResizeObserver(() => positionCards(rail, entries))
    observer.observe(rail)
    for (const {button} of entries) observer.observe(button)
    sheet.rails.push({rail,observer})
  }
}
