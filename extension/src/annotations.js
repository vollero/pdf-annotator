export const colors = [
  ['Amber','#efc650'], ['Sage','#9abd9e'], ['Sky','#91b9dd'], ['Rose','#e5a4ae'], ['Lavender','#b3a1d4']
]
export const titles = { highlight: 'Highlight', draw: 'Drawing', note: 'Note' }
export const NS = 'http://www.w3.org/2000/svg'
export function shape(name, attrs) {
  const el = document.createElementNS(NS,name)
  for (const [key,value] of Object.entries(attrs)) el.setAttribute(key,value)
  return el
}
export function paintMark(mark, width, height, interactive = false) {
  const group = shape('g', { 'data-id':mark.id })
  if (mark.type === 'highlight') {
    for (const [x,y,w,h] of mark.rects) group.append(shape('rect',{
      x:x*width, y:y*height, width:w*width, height:h*height, fill:mark.color, opacity:.48
    }))
    group.style.mixBlendMode='multiply'
  } else if (mark.type === 'draw') {
    group.append(shape('polyline',{
      points:mark.points.map(([x,y])=>[x*width,y*height].join(',')).join(' '),
      fill:'none',stroke:mark.color,'stroke-width':2.4,'stroke-linejoin':'round','stroke-linecap':'round'
    }))
  } else {
    const x=mark.point[0]*width, y=mark.point[1]*height
    group.setAttribute('transform','translate('+x+' '+y+')')
    group.setAttribute('class','note-marker')
    group.append(shape('path',{d:'M1 1h16v12h-6l-5 4v-4H1z',fill:mark.color,stroke:'#484c43','stroke-width':.8,'stroke-linejoin':'round'}))
    group.append(shape('path',{d:'M4 5h10M4 8h7',fill:'none',stroke:'#484c43','stroke-width':1}))
    if (interactive) {
      group.setAttribute('tabindex','0')
      group.setAttribute('role','button')
      group.setAttribute('aria-label','Edit note on page ' + mark.page)
      group.setAttribute('aria-haspopup','dialog')
    }
  }
  return group
}
export function anchor(mark) {
  if (mark.type==='note') return mark.point
  if (mark.type==='draw') return mark.points[0]
  return mark.rects[0]
}
