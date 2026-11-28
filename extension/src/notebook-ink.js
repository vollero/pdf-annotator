import {radius} from './notebook-data.js'
export const W=595,H=842
const n=v=>Number(v.toFixed(2))
// A filled outline keeps translucent ink at a single opacity along each stroke.
export function inkPath(stroke,w=W,h=H) {
  const pts=stroke.points
  const left=[],right=[]
  for(let i=0;i<pts.length;i++) {
    const p=pts[i],a=pts[Math.max(0,i-1)],b=pts[Math.min(pts.length-1,i+1)]
    const dx=(b[0]-a[0])*w,dy=(b[1]-a[1])*h,len=Math.hypot(dx,dy)
    const r=radius(stroke,p)*w,x=p[0]*w,y=p[1]*h
    if (!len && pts.length===1) return 'M '+n(x-r)+' '+n(y)+' a '+n(r)+' '+n(r)+' 0 1 0 '+n(2*r)+' 0 a '+n(r)+' '+n(r)+' 0 1 0 '+n(-2*r)+' 0 Z'
    const nx=len ? -dy*r/len : r,ny=len ? dx*r/len : 0
    left.push(n(x+nx)+' '+n(y+ny));right.push(n(x-nx)+' '+n(y-ny))
  }
  return 'M '+left.concat(right.reverse()).join(' L ')+' Z'
}
export function paperLines(paper) {
  const lines=[]
  if (paper!=='blank') for(let y=20;y<H;y+=20) lines.push([0,y,W,y])
  if (paper==='grid') for(let x=20;x<W;x+=20) lines.push([x,0,x,H])
  return lines
}
