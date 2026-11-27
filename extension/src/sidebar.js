import { icon } from './icons.js'
import { titles } from './annotations.js'
import { noteStatus } from './mark-data.js'

function el(tag,cls,text) {
  const e=document.createElement(tag)
  if(cls) e.className=cls
  if(text) e.textContent=text
  return e
}
export function renderCards({marks,page,currentOnly,selected,jump,edit,remove,setDone}) {
  const container=document.getElementById('cards'), frag=document.createDocumentFragment()
  document.getElementById('annotation-count').textContent=marks.length
  const actionFilter = document.getElementById('action-filter')
  const onPages = marks.filter(m => !currentOnly || m.page === page)
  const todo = onPages.filter(m => m.done === false).length
  const done = onPages.filter(m => m.done === true).length
  actionFilter.options[1].textContent = 'To do (' + todo + ')'
  actionFilter.options[2].textContent = 'Done (' + done + ')'
  const hasActions = marks.some(m => m.done !== undefined)
  if (!hasActions) actionFilter.value = 'all'
  document.getElementById('action-filter-wrap').hidden = !hasActions
  const status = actionFilter.value
  const visible = onPages.filter(m => status === 'all' || m.done === (status === 'done')).sort((a,b)=>a.page-b.page)
  const focused = document.activeElement
  const focusIndex = focused.matches('.card-check') ? [...container.querySelectorAll('.card-check')].indexOf(focused) : -1
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
    if (mark.done !== undefined) {
      const label = el('label','check-label')
      const box = el('input','card-check')
      box.type = 'checkbox'
      box.checked = mark.done
      box.dataset.id = mark.id
      box.setAttribute('aria-label','Mark action as done on page ' + mark.page + ': ' + mark.text.slice(0,100))
      box.onchange = () => setDone(mark, box.checked)
      label.append(box, noteStatus(mark))
      card.append(label)
    }
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
  if (!visible.length) {
    const empty = status === 'all' ? (currentOnly ? 'No annotations on this page.' : 'Choose a tool and mark the page. Your annotations will appear here.')
      : (status === 'todo' ? 'No actions to do' : 'No completed actions') + (currentOnly ? ' on this page.' : '.')
    frag.append(el('p','empty',empty))
  }
  container.replaceChildren(frag)
  if (focusIndex >= 0) {
    const boxes = [...container.querySelectorAll('.card-check')]
    const next = boxes.find(box => box.dataset.id === focused.dataset.id) ?? boxes[Math.min(focusIndex, boxes.length - 1)]
    const target = next ?? (hasActions ? actionFilter : document.getElementById('filter'))
    target.focus()
  }
}
export function closeCardMenus() {
  document.querySelectorAll('.card-menu').forEach(el=>el.remove())
  document.querySelectorAll('.more[aria-expanded="true"]').forEach(el=>el.setAttribute('aria-expanded','false'))
}
