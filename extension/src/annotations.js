import { fitNotePoint, noteStatus } from './mark-data.js'
import { markupLabels, markupStrokes } from './markup.js'

export const titles = { highlight: 'Highlight', draw: 'Drawing', note: 'Note', comment: 'Passage comment' }
export const NS = 'http://www.w3.org/2000/svg'
export function populateMarkupPicker(select, style = 'highlight') {
  for (const [value,label] of Object.entries(markupLabels)) select.add(new Option(label,value))
  select.value = style
}
export function shape(name, attrs) {
  const el = document.createElementNS(NS,name)
  for (const [key,value] of Object.entries(attrs)) el.setAttribute(key,value)
  return el
}
export function paintMark(mark, width, height, interactive = false, part = mark) {
  const group = shape('g', { 'data-id':mark.id })
  if (part.rects && mark.style) {
    const ink = shape('g',{fill:'none',stroke:mark.color,'data-markup':mark.style})
    for (const {points,closed,thickness,dash,dotted} of markupStrokes(part.rects,width,height,mark.style)) {
      const path = shape(closed ? 'polygon' : 'polyline',{
        points:points.map(p=>p.join(',')).join(' '),'stroke-width':thickness,'stroke-linejoin':'round',
        'stroke-linecap':dotted ? 'round' : 'butt'
      })
      if (dash) path.setAttribute('stroke-dasharray',dash.join(' '))
      ink.append(path)
    }
    group.append(ink)
  } else if (part.rects) {
    const fill = shape('g',{})
    for (const [x,y,w,h] of part.rects) fill.append(shape('rect',{
      x:x*width, y:y*height, width:w*width, height:h*height, fill:mark.color, opacity:.48
    }))
    fill.style.mixBlendMode='multiply'
    group.append(fill)
  } else if (mark.type === 'draw') {
    group.append(shape('polyline',{
      points:mark.points.map(([x,y])=>[x*width,y*height].join(',')).join(' '),
      fill:'none',stroke:mark.color,'stroke-width':2.4,'stroke-linejoin':'round','stroke-linecap':'round'
    }))
  }
  if (mark.type === 'note' || mark.type === 'comment') {
    let x, y
    if (mark.type === 'comment') {
      const [left,top,w] = part.rects.at(-1)
      x = Math.max(0,Math.min(width - 18,(left + w)*width + 2))
      y = Math.max(0,Math.min(height - 18,top*height))
    } else {
      const [u,v] = fitNotePoint(mark.point,width,height)
      x = u*width; y = v*height
    }
    const marker = shape('g',{'data-id':mark.id,transform:'translate('+x+' '+y+')',class:'note-marker'})
    group.append(marker)
    marker.append(shape('path',{d:'M1 1h16v12h-6l-5 4v-4H1z',fill:mark.color,stroke:'#484c43','stroke-width':.8,'stroke-linejoin':'round'}))
    const status = noteStatus(mark)
    if (status) {
      marker.append(shape('rect',{x:5,y:2.5,width:8,height:8,rx:1,fill:'white',stroke:'#353a32','stroke-width':1}))
      if (mark.done) marker.append(shape('path',{d:'m6.5 6.5 1.8 1.8 3.3-3.8',fill:'none',stroke:'#353a32','stroke-width':1.5}))
    } else marker.append(shape('path',{d:'M4 5h10M4 8h7',fill:'none',stroke:'#484c43','stroke-width':1}))
    if (interactive) {
      if (mark.type === 'note') {
        marker.classList.add('point-note')
        marker.setAttribute('aria-description','Click to edit or drag to move on this page.')
        // Reserve touches on the SVG marker for dragging. The page around it still scrolls.
        marker.addEventListener('touchstart',event=>event.preventDefault(),{passive:false})
      }
      marker.setAttribute('tabindex','0')
      marker.setAttribute('role','button')
      marker.setAttribute('aria-label',(mark.type === 'comment' ? 'Edit comment' : 'Edit note') + ' on page ' + part.page + (status ? ' (' + status + ')' : ''))
      marker.setAttribute('aria-haspopup','dialog')
    }
  }
  return group
}
export function anchor(part) {
  return part.point ?? part.points?.[0] ?? part.rects[0]
}
