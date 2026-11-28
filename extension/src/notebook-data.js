export const blankPage = (paper='grid') => ({paper,strokes:[]})
export const pageLimit = 256
const hash = s=>typeof s==='string' && /^[0-9a-f]{64}$/.test(s)
const id = s=>typeof s==='string' && /^[a-zA-Z0-9._-]{1,128}$/.test(s)
const unit = n=>Number.isFinite(n) && n>=0 && n<=1
const unique = list=>new Set(list.map(item=>item.id)).size===list.length
export function validRefs(refs) {
  return Array.isArray(refs) && refs.length>0 && refs.length<=pageLimit &&
    refs.every(r=>r && id(r.id) && hash(r.rev) && Array.isArray(r.past) && r.past.length<=32 && r.past.every(hash) &&
      Object.keys(r).every(k=>['id','rev','past','conflict'].includes(k)) && (r.conflict===undefined || r.conflict===true)) && unique(refs)
}
export function checkPage(page) {
  if (!page || Object.keys(page).some(k=>!['paper','strokes'].includes(k)) || !['grid','ruled','blank'].includes(page.paper) ||
      !Array.isArray(page.strokes) || page.strokes.length>10000) throw Error('Invalid notebook page.')
  let count=0
  for (const s of page.strokes) {
    if (!s || !id(s.id) || !['pen','highlight'].includes(s.tool) || !/^#[0-9a-f]{6}$/i.test(s.color) ||
      !Number.isFinite(s.width) || s.width<=0 || s.width>0.05 || !Array.isArray(s.points) || !s.points.length ||
      (count+=s.points.length)>150000 || Object.keys(s).some(k=>!['id','tool','color','width','points'].includes(k)) ||
      !s.points.every(p=>Array.isArray(p) && p.length===3 && p.every(unit))) throw Error('Invalid or oversized notebook stroke.')
  }
  if (!unique(page.strokes)) throw Error('Duplicate notebook stroke.')
}
export async function pageHash(page) {
  const bytes=new TextEncoder().encode(JSON.stringify(page))
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('')
}
export function nextRef(prior,rev) {
  if (!prior) return {id:crypto.randomUUID(),rev,past:[]}
  if (prior.rev===rev) return prior
  return {...prior,rev,past:[...prior.past.filter(v=>v!==rev && v!==prior.rev),prior.rev].slice(-32)}
}

// Keep the incoming page order. Divergent editions get stable copy IDs so reimport is idempotent.
export function mergePages(local=[],incoming=[],base=[]) {
  const byId=new Map(local.map(r=>[r.id,r])), result=new Map()
  const extra=[]
  for (const r of incoming) {
    const other=byId.get(r.id)
    if (!other || other.rev===r.rev || r.past.includes(other.rev)) result.set(r.id,r)
    else if (other.past.includes(r.rev)) result.set(r.id,other)
    else {
      result.set(r.id,other)
      const copyId=r.id.split('.')[0]+'.'+r.rev.slice(0,32)
      extra.push({...r,id:copyId,conflict:true})
    }
  }
  const removed=new Map(base.map(r=>[r.id,r.rev]))
  for (const r of local) if (!result.has(r.id) && removed.get(r.id)!==r.rev) result.set(r.id,r)
  for (const r of extra) if (!result.has(r.id)) result.set(r.id,r)
  const refs=[...result.values()]
  if (!validRefs(refs)) throw Error('A notebook supports up to 256 pages.')
  return refs
}
export function radius(s,p) { return s.width*(s.tool==='highlight' ? 1 : 0.2+0.8*p[2])/2 }
export function inside([x,y],polygon) {
  let hit=false
  for (let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
    const [a,b]=polygon[i],[c,d]=polygon[j]
    if ((b>y)!==(d>y) && x<(c-a)*(y-b)/(d-b)+a) hit=!hit
  }
  return hit
}
