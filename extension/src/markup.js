export const markupLabels = Object.freeze({
  highlight:'Highlight',
  underline:'Solid underline',
  'dashed-underline':'Dashed underline',
  'dotted-underline':'Dotted underline',
  strikethrough:'Strikethrough',
  'outline-box':'Outline box'
})

export function withMarkupStyle(mark, style) {
  const next = {...mark}
  if (style === 'highlight') delete next.style
  else next.style = style
  return next
}

// Adjacent PDF text runs can use different fonts on the same line. Join their
// strokes without bridging a line break or the gap between columns.
export function* markupStrokes(rects, width, height, style) {
  let line
  for (const [x,y,w,h] of rects) {
    if (!w || !h) continue
    const left = x*width, right = (x+w)*width, top = y*height, bottom = (y+h)*height
    if (line) {
      const tolerance = Math.min(bottom-top,line.bottom-line.top)*.22
      if (Math.abs(line.top-top) <= tolerance && Math.abs(line.bottom-bottom) <= tolerance &&
          left <= line.right+tolerance && right >= line.left-tolerance) {
        line.left = Math.min(line.left,left)
        line.right = Math.max(line.right,right)
        line.top = Math.min(line.top,top)
        line.bottom = Math.max(line.bottom,bottom)
        continue
      }
      yield stroke(line,style)
    }
    line = {left,right,top,bottom}
  }
  if (line) yield stroke(line,style)
}

export function markupThickness(width,height,style) {
  return Math.min(Math.max(.9,height*.09),2.4,height/2,style==='outline-box' ? width/2 : width)
}

function stroke({left,right,top,bottom},style) {
  const height = bottom-top
  const thickness = markupThickness(right-left,height,style)
  const inset = thickness/2
  if (style === 'outline-box') {
    return {thickness, closed:true, points:[[left+inset,top+inset],[right-inset,top+inset],
      [right-inset,bottom-inset],[left+inset,bottom-inset]]}
  }
  const y = style === 'strikethrough' ? top+height*.52 : bottom-inset
  const dotted = style === 'dotted-underline'
  const dash = dotted ? [.1*thickness,2.5*thickness] : style === 'dashed-underline' ? [3.5*thickness,2*thickness] : undefined
  return {points:[[left+inset,y],[right-inset,y]], thickness, dash, dotted}
}
