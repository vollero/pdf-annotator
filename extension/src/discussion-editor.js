import { newEntry, saveHistory, threadRows } from './discussion.js'
import { validAuthor } from './comment-details.js'

const $ = id=>document.getElementById(id)
function element(tag,text) {
  const node = document.createElement(tag)
  node.textContent = text
  return node
}
function action(text,click) {
  const button = element('button',text)
  button.type = 'button'
  button.className = 'appearance-link'
  button.onclick = click
  return button
}
function heading(entry,title) {
  const head = element('div',title+' · '+(entry.author ?? 'Anonymous')+' · ')
  const time = element('time',new Date(entry.at).toLocaleString())
  time.dateTime = entry.at
  head.append(time)
  return head
}

export function openDiscussion(original,defaultAuthor,previewBody) {
  const rows = threadRows(original.replies)
  const versions = original.history?.versions ?? []
  $('discussion').open = false
  $('versions').open = false
  $('discussion-title').textContent = 'Discussion and version history'+(rows.length ? ' ('+rows.length+(rows.length===1 ? ' reply)' : ' replies)') : '')
  $('contributor').value = defaultAuthor
  $('contributor').setCustomValidity('')
  $('contributor').oninput = ()=>$('contributor').setCustomValidity('')
  $('reply-text').value = ''
  $('track-history').checked = !!original.history?.enabled
  $('versions-title').textContent = 'Saved versions ('+versions.length+')'
  $('versions').hidden = !versions.length
  let parent
  function target(row) {
    parent = row?.entry.id
    $('reply-target').textContent = row ? 'Reply to #'+row.number+' by '+(row.entry.author ?? 'Anonymous') : 'Reply to the original comment'
    $('reply-root').hidden = !row
  }
  target()
  $('reply-root').onclick = ()=>{ target(); $('reply-text').focus() }
  $('reply-list').replaceChildren(...rows.map(row=>{
    const {entry,number,parentNumber,depth} = row
    const item = document.createElement('article')
    item.style.marginInlineStart = Math.min(depth,4)*0.8+'em'
    item.append(heading(entry,'#'+number+(parentNumber ? ' in reply to #'+parentNumber : '')),element('p',entry.text),
      action('Reply to #'+number,()=>{ target(row); $('reply-text').focus() }))
    return item
  }))
  $('version-list').replaceChildren(...versions.map((entry,i)=>{
    const item = document.createElement('article')
    item.append(heading(entry,(entry.baseline ? 'Snapshot ' : 'Version ')+(i+1)),element('p',entry.text),
      action('Use version '+(i+1),()=>{
        $('note-text').value = entry.text
        $('note-markdown').checked = entry.textFormat === 'markdown'
        $('markdown-preview').hidden = !$('note-markdown').checked
        previewBody()
        $('note-text').focus()
      }))
    return item
  }).reverse())

  return function applyDiscussion(mark,current) {
    const actor = $('contributor').value.trim().normalize('NFC')
    if (actor && !validAuthor(actor)) {
      $('discussion').open = true
      $('contributor').setCustomValidity('Enter a name up to 100 characters on one line.')
      $('contributor').reportValidity()
      return false
    }
    const reply = $('reply-text').value.trim()
    if (reply) {
      if (parent && !current?.replies?.some(entry=>entry.id===parent)) throw new Error('The parent reply was removed. Choose the original comment to post this reply.')
      const entry = newEntry(reply,actor)
      if (parent) entry.parent = parent
      mark.replies = [...(mark.replies ?? []),entry]
    }
    const selected = $('track-history').checked
    const enabled = selected === !!original.history?.enabled ? !!current?.history?.enabled : selected
    const history = saveHistory(current,mark,enabled,actor || (!current ? mark.author : ''))
    if (history) mark.history = history
    return true
  }
}
