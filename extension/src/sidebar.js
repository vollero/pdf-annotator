import { icon } from './icons.js'
import { titles } from './annotations.js'

function el(tag,cls,text) {
  const e=document.createElement(tag)
  if(cls) e.className=cls
  if(text) e.textContent=text
  return e
}
export function renderCards({marks,page,currentOnly,selected,jump,edit,remove}) {
  const container=document.getElementById('cards'), frag=document.createDocumentFragment()
  document.getElementById('annotation-count').textContent=marks.length
  const visible=marks.filter(m=>!currentOnly || m.page===page).sort((a,b)=>a.page-b.page)
  let previous
  for(const mark of visible) {
    if(mark.page!==previous) {
      const header=el('h3','page-label','Page '+mark.page)
      header.prepend(icon('page'))
      frag.append(header); previous=mark.page
    }
    const card=el('article','card'+(selected===mark.id?' selected':'')),head=el('div','card-head')
    card.style.setProperty('--tone',mark.color)
    const symbol=el('span','card-icon')
    symbol.append(icon(mark.type))
    const more=el('button','icon-button more')
    more.setAttribute('aria-label',titles[mark.type]+' actions')
    more.setAttribute('aria-expanded','false')
    more.append(icon('more'))
    head.append(symbol,el('span','card-title',titles[mark.type]),more)
    const body=el('button','card-body'+(mark.type==='highlight'?' quoted':''),mark.text)
    body.title='Show on page '+mark.page
    body.onclick=()=>jump(mark)
    card.append(head,body)
    more.onclick=()=>{
      const open=more.getAttribute('aria-expanded')==='true'
      closeCardMenus()
      if(open) return
      more.setAttribute('aria-expanded','true')
      const menu=el('div','card-menu')
      if(mark.type==='note') {
        const change=el('button','','Edit note')
        change.prepend(icon('draw'))
        change.onclick=()=>{closeCardMenus();edit(mark)}
        menu.append(change)
      }
      const del=el('button','','Delete')
      del.prepend(icon('trash'))
      del.onclick=()=>{remove(mark);document.querySelector('[data-tool].active')?.focus()}
      menu.append(del);card.append(menu)
      menu.querySelector('button').focus()
    }
    frag.append(card)
  }
  if(!visible.length) frag.append(el('p','empty',currentOnly?'No annotations on this page.':'Choose a tool and mark the page. Your annotations will appear here.'))
  container.replaceChildren(frag)
}
export function closeCardMenus() {
  document.querySelectorAll('.card-menu').forEach(el=>el.remove())
  document.querySelectorAll('.more[aria-expanded="true"]').forEach(el=>el.setAttribute('aria-expanded','false'))
}
