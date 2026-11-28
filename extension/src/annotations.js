import {inlineStroke,inkPath} from './notebook-ink.js'
import { fitNotePoint, isNote, noteDimensions, noteStatus } from './mark-data.js'
import { markupLabels, markupStrokes, markupThickness } from './markup.js'
import { renderNoteText } from './note-format.js'

export const titles = { highlight: 'Highlight', draw: 'Drawing', note: 'Note', region: 'Region note', comment: 'Passage comment' }
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
  } else if (mark.ink) {
    group.append(shape('path',{d:inkPath(inlineStroke(mark),width,height),fill:mark.color,opacity:mark.ink.brush==='highlight'?.32:1}))
  } else if (mark.type === 'draw') {
    group.append(shape('polyline',{
      points:mark.points.map(([x,y])=>[x*width,y*height].join(',')).join(' '),
      fill:'none',stroke:mark.color,'stroke-width':2.4,'stroke-linejoin':'round','stroke-linecap':'round'
    }))
  }
  if (isNote(mark)) {
    let x, y
    if (mark.type === 'comment') {
      const [left,top,w] = part.rects.at(-1)
      x = Math.max(0,Math.min(width - 18,(left + w)*width + 2))
      y = Math.max(0,Math.min(height - 18,top*height))
    } else {
      const [u,v] = fitNotePoint(mark.point,width,height,mark)
      x = u*width; y = v*height
    }
    const marker = shape('g',{'data-id':mark.id,transform:'translate('+x+' '+y+')',class:'note-marker'})
    let editTarget = marker
    group.append(marker)
    const status = noteStatus(mark)
    const [w,h] = noteDimensions(mark,width,height)
    if (mark.type === 'region') {
      marker.classList.add('region-note')
      const stroke = markupThickness(w,h,'outline-box')
      const bounds = {x:stroke/2,y:stroke/2,width:w-stroke,height:h-stroke,fill:'none'}
      marker.append(shape('rect',{...bounds,stroke:mark.color,'stroke-width':stroke}))
      if (interactive) marker.append(shape('rect',{...bounds,class:'region-edge',stroke:'transparent','stroke-width':Math.min(8,w/3,h/3)}))
    } else if (mark.size) {
      marker.classList.add('expanded-note')
      marker.append(shape('rect',{x:1,y:1,width:Math.max(0,w-2),height:Math.max(0,h-2),rx:2,fill:'#fffdf5',stroke:mark.color,'stroke-width':2}))
      const body = shape('foreignObject',{x:5,y:4,width:Math.max(0,w-10),height:Math.max(0,h-8)})
      const text = document.createElement('div')
      text.className = 'page-note-text'
      renderNoteText(text,mark,status,interactive)
      if (text.querySelector('a')) {
        editTarget = marker.firstElementChild
        editTarget.classList.add('note-edit-target')
      }
      body.append(text)
      marker.append(body)
    } else {
      marker.append(shape('path',{d:'M1 1h16v12h-6l-5 4v-4H1z',fill:mark.color,stroke:'#484c43','stroke-width':.8,'stroke-linejoin':'round'}))
      if (status) {
        marker.append(shape('rect',{x:5,y:2.5,width:8,height:8,rx:1,fill:'white',stroke:'#353a32','stroke-width':1}))
        if (mark.done) marker.append(shape('path',{d:'m6.5 6.5 1.8 1.8 3.3-3.8',fill:'none',stroke:'#353a32','stroke-width':1.5}))
      } else marker.append(shape('path',{d:'M4 5h10M4 8h7',fill:'none',stroke:'#484c43','stroke-width':1}))
    }
    if (interactive) {
      if (mark.type !== 'comment') {
        marker.classList.add('movable-note')
        if (mark.type === 'note') marker.classList.add('point-note')
        editTarget.setAttribute('aria-description','Click to edit, drag to move, or use Shift and the arrow keys to resize.')
        const handle = shape('g',{class:'note-resize-handle',transform:'translate('+w+' '+h+')'})
        const grip = Math.min(10,w/2,h/2)
        const hitArea = mark.size ? shape('rect',{x:-grip,y:-grip,width:grip,height:grip,fill:'transparent'}) :
          shape('path',{d:'M-8 0 0 -8V0Z',fill:'transparent'})
        handle.append(hitArea,
          shape('path',{d:'m-7 -1 6 -6 m-3 6 3 -3',transform:'scale('+Math.min(1,grip/8)+')',fill:'none',stroke:'#484c43','stroke-width':1.2}))
        marker.append(handle)
        // Reserve touches on the SVG marker for dragging. The page around it still scrolls.
        marker.addEventListener('touchstart',event=>{
          if (!event.target.closest('a')) event.preventDefault()
        },{passive:false})
      }
      editTarget.setAttribute('tabindex','0')
      editTarget.setAttribute('role','button')
      const label = mark.type === 'region' ? 'Edit region note' : mark.type === 'comment' ? 'Edit comment' : 'Edit note'
      editTarget.setAttribute('aria-label',label + ' on page ' + part.page + (status ? ' (' + status + ')' : ''))
      editTarget.setAttribute('aria-haspopup','dialog')
      editTarget.setAttribute('aria-keyshortcuts','P')
    }
  }
  return group
}
export function anchor(part) {
  return part.point ?? part.points?.[0] ?? part.rects[0]
}
