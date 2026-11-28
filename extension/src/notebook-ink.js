import {radius} from './notebook-data.js'
export const W=595,H=842
const n=v=>Number(v.toFixed(2))
// A filled outline keeps translucent ink at a single opacity along each stroke.
export function inkOutline(stroke,w=W,h=H) {
  const pts=stroke.points
  const left=[],right=[]
  for(let i=0;i<pts.length;i++) {
    const p=pts[i],a=pts[Math.max(0,i-1)],b=pts[Math.min(pts.length-1,i+1)]
    const dx=(b[0]-a[0])*w,dy=(b[1]-a[1])*h,len=Math.hypot(dx,dy)
    const r=radius(stroke,p)*w,x=p[0]*w,y=p[1]*h
    if (!len && pts.length===1) return Array.from({length:16},(_,i)=>[x+r*Math.cos(i*Math.PI/8),y+r*Math.sin(i*Math.PI/8)])
    const nx=len ? -dy*r/len : r,ny=len ? dx*r/len : 0
    left.push([x+nx,y+ny]);right.push([x-nx,y-ny])
  }
  return left.concat(right.reverse())
}
export function inkPath(stroke,w=W,h=H) {
  return 'M '+inkOutline(stroke,w,h).map(([x,y])=>n(x)+' '+n(y)).join(' L ')+' Z'
}
export function inlineStroke(mark) {
  return {width:mark.ink.width,tool:mark.ink.brush,points:mark.points.map(([x,y],i)=>[x,y,mark.ink.pressure[i]])}
}
export function paperLines(paper) {
  const lines=[]
  if (paper!=='blank') for(let y=20;y<H;y+=20) lines.push([0,y,W,y])
  if (paper==='grid') for(let x=20;x<W;x+=20) lines.push([x,0,x,H])
  return lines
}
