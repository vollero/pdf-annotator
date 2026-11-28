import { icon } from './icons.js'
import { titles, populateMarkupPicker } from './annotations.js'
import { markupLabels } from './markup.js'
import { noteStatus, partOnPage, quotedText } from './mark-data.js'

function el(tag,cls,text) {
  const e=document.createElement(tag)
  if(cls) e.className=cls
  if(text) e.textContent=text
  return e
}

function searchAnnotations(marks, query, pagePrefix) {
  if (!query) return marks
  const pageNumber = pagePrefix ? Number(pagePrefix[1]) : null
  const words = query.slice(pagePrefix?.[0].length ?? 0).match(/\S+/gu) ?? []
  const barePage = /^\d+$/u.test(query) ? Number(query) : null
  return marks.filter(mark => {
    if (pageNumber !== null && !partOnPage(mark,pageNumber)) return false
    if (!words.length || (barePage !== null && partOnPage(mark,barePage))) return true
    const content = mark.type === 'comment' ? mark.text + '\n' + quotedText(mark) : mark.text
    const text = content.normalize('NFC').toLowerCase()
    return words.every(word => text.includes(word))
  })
}

export function renderCards({marks,page,currentOnly,selected,jump,edit,recolor,remove,setDone,setStyle}) {
  const container=document.getElementById('cards'), frag=document.createDocumentFragment()
  document.getElementById('annotation-count').textContent=marks.length
  const actionFilter = document.getElementById('action-filter')
  const query = document.getElementById('annotation-search').value.trim().normalize('NFC').toLowerCase()
  const pagePrefix = /^page\s+(\d+)(?:\s+|$)/u.exec(query)
  const pageQuery = pagePrefix ? Number(pagePrefix[1]) : /^\d+$/u.test(query) ? Number(query) : null
  const onPages = currentOnly ? marks.filter(m => partOnPage(m,page)) : marks
  const matches = currentOnly && pagePrefix && pageQuery !== page ? [] : searchAnnotations(onPages,query,pagePrefix)
  const todo = matches.filter(m => m.done === false).length
  const done = matches.filter(m => m.done === true).length
  actionFilter.options[1].textContent = 'To do (' + todo + ')'
  actionFilter.options[2].textContent = 'Done (' + done + ')'
  const hasActions = marks.some(m => m.done !== undefined)
  if (!hasActions) actionFilter.value = 'all'
  document.getElementById('action-filter-wrap').hidden = !hasActions
  const status = actionFilter.value
  const visible = matches.filter(m => status === 'all' || m.done === (status === 'done')).map(mark => ({
    mark, part:partOnPage(mark,currentOnly ? page : pageQuery ?? mark.page) ?? mark.passages?.[0] ?? mark
  })).sort((a,b)=>a.part.page-b.part.page)
  const summary = document.getElementById('search-summary')
  const resultCount = query ? visible.length + (visible.length === 1 ? ' matching annotation' : ' matching annotations') : ''
  if (summary.textContent !== resultCount) summary.textContent = resultCount
  const focused = document.activeElement
  const focusedResultId = focused.closest('.card-body')?.dataset.id
  const focusIndex = focused.matches('.card-check') ? [...container.querySelectorAll('.card-check')].indexOf(focused) : -1
  let focusedResult
  let previous
  for(const {mark,part} of visible) {
    if(part.page!==previous) {
      const header=el('h3','page-label','Page '+part.page)
      header.prepend(icon('page'))
      frag.append(header); previous=part.page
    }
    const card=el('article','card'+(selected===mark.id?' selected':'')),head=el('div','card-head')
    card.style.setProperty('--tone',mark.color)
    const symbol=el('span','card-icon')
    symbol.append(icon(mark.type === 'comment' ? 'note' : mark.type))
    const more=el('button','icon-button more')
    const title = mark.type === 'highlight' && mark.style ? markupLabels[mark.style] : titles[mark.type]
    more.setAttribute('aria-label',title+' actions')
    more.setAttribute('aria-expanded','false')
    more.append(icon('more'))
    head.append(symbol,el('span','card-title',title),more)
    const body=el('button','card-body'+(mark.type==='highlight'?' quoted':''),mark.text)
    if (mark.type === 'comment') body.prepend(el('span','card-quote',quotedText(mark)))
    body.dataset.id = mark.id
    if (focusedResultId === mark.id) focusedResult = body
    body.title='Show on page '+part.page
    body.onclick=()=>jump(mark,part)
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
      const focusActions = () => {
        const body = [...container.querySelectorAll('.card-body')].find(b=>b.dataset.id===mark.id)
        body?.closest('.card')?.querySelector('.more')?.focus({preventScroll:true})
      }
      if(mark.type==='note' || mark.type==='comment') {
        const change=el('button','',mark.type==='comment' ? 'Edit comment' : 'Edit note')
        change.prepend(icon('draw'))
        change.onclick=()=>{closeCardMenus();edit(mark)}
        menu.append(change)
      }
      if (mark.type === 'highlight' || mark.type === 'comment') {
        const label = el('label','','Markup style')
        const picker = el('select')
        populateMarkupPicker(picker,mark.style)
        picker.onchange = () => {
          setStyle(mark,picker.value)
          focusActions()
        }
        label.append(picker)
        menu.append(label)
      }
      const color=el('button','','Change color')
      color.prepend(icon('palette'))
      color.setAttribute('aria-haspopup','dialog')
      color.onclick=async()=>{
        closeCardMenus()
        more.focus({preventScroll:true})
        await recolor(mark)
        focusActions()
      }
      menu.append(color)
      const del=el('button','','Delete')
      del.prepend(icon('trash'))
      del.onclick=()=>{remove(mark);document.querySelector('[data-tool].active')?.focus()}
      menu.append(del);card.append(menu)
      menu.querySelector('button,select').focus()
    }
    frag.append(card)
  }
  if (!visible.length && query) {
    frag.append(el('p','empty','Try another search or change the filters.'))
  } else if (!visible.length) {
    const empty = status === 'all' ? (currentOnly ? 'No annotations on this page.' : 'Choose a tool and mark the page. Your annotations will appear here.')
      : (status === 'todo' ? 'No actions to do' : 'No completed actions') + (currentOnly ? ' on this page.' : '.')
    frag.append(el('p','empty',empty))
  }
  container.replaceChildren(frag)
  if (focusedResult) focusedResult.focus({preventScroll:true})
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
