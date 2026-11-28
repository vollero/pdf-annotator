import { Lexer } from '../vendor/marked.mjs'

const parsed = new WeakMap()

function noteTokens(mark) {
  let tokens = parsed.get(mark)
  if (!tokens) {
    // The editor accepts 12,000 characters. Large imported notes remain readable as source.
    if (mark.text.length <= 12000) {
      try { tokens = Lexer.lex(mark.text,{gfm:false}) }
      catch { /* Keep the source if the parser cannot handle its nesting. */ }
    }
    tokens ??= [{type:'text',text:mark.text}]
    parsed.set(mark,tokens)
  }
  return tokens
}

// Both the PDF worker and the editor read the same tokens. Only these fixed
// presentation elements can enter the DOM, and all user strings become text.
function writeTokens(tokens, parent, write, depth = 0, indent = '', style = {}) {
  function text(value) {
    if (value) { parent?.append(value); write?.(value,style) }
  }
  function child(tag) {
    if (!parent) return null
    const node = document.createElement(tag)
    parent.append(node)
    return node
  }
  for (const token of tokens) {
    if (depth >= 32) { text(token.raw); continue }
    switch (token.type) {
      case 'paragraph':
      case 'text':
        if (token.tokens) {
          writeTokens(token.tokens,parent,write,depth+1,indent,style)
          if (token.raw.endsWith('\n') && !token.text.endsWith('\n')) text('\n')
        } else text(token.text)
        break
      case 'escape': text(token.text); break
      case 'br': text('\n'); break
      case 'strong':
      case 'em':
        writeTokens(token.tokens,child(token.type),write,depth+1,indent,{...style,[token.type]:true})
        break
      case 'codespan':
        child('code')?.append(token.text)
        write?.(token.text,{...style,code:true})
        break
      case 'code': {
        if (token.codeBlockStyle === 'indented') { text(token.raw); break }
        const pre = child('pre')
        if (pre) {
          pre.className = 'note-code-block'
          const code = document.createElement('code')
          code.textContent = token.text
          pre.append(code)
        }
        write?.(token.text,{...style,code:true,codeBlock:true})
        // The block element separates the next paragraph on screen. Plain PDF
        // comments and canvas text need an explicit line break at that boundary.
        if (token.raw.endsWith('\n') && !token.text.endsWith('\n')) write?.('\n',style)
        break
      }
      case 'list': {
        const list = child(token.ordered ? 'ol' : 'ul')
        if (list && token.ordered) list.start = token.start
        for (const [index,item] of token.items.entries()) {
          const li = list && document.createElement('li')
          list?.append(li)
          if (index) write?.('\n',style)
          write?.(indent + (token.ordered ? (token.start+index)+'. ' : '• '),style)
          writeTokens(item.tokens,li,write,depth+1,indent+'  ',style)
        }
        if (token.raw.endsWith('\n')) text('\n')
        break
      }
      default: text(token.raw)
    }
  }
}

export function readableNoteText(mark) {
  if (mark.textFormat !== 'markdown') return mark.text
  const parts = []
  writeTokens(noteTokens(mark),null,value => parts.push(value))
  return parts.join('')
}

export function noteTextRuns(mark, status) {
  const runs = status ? [{text:status+' · '}] : []
  if (mark.textFormat === 'markdown') {
    writeTokens(noteTokens(mark),null,(text,style) => runs.push({text,...style}))
  } else runs.push({text:mark.text})
  return runs
}

export function renderNoteText(target, mark, status = '') {
  const prefix = status ? status+' · ' : ''
  if (mark.textFormat !== 'markdown') {
    target.textContent = prefix + mark.text
    return
  }
  const fragment = document.createDocumentFragment()
  if (prefix) fragment.append(prefix)
  writeTokens(noteTokens(mark),fragment,null)
  target.replaceChildren(fragment)
}
