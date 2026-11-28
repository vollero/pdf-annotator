import { render } from '../vendor/katex.mjs'

// Recognize math before Markdown can consume TeX backslashes and subscripts.
// Each alternative consumes an escaped character or a non-delimiter character.
const inlineDollar = /^\$(?![\s$])((?:\\[^\n]|[^\\$`\n])+?)(?<!\s)\$(?![\d$])/u
const displayDollar = /^\$\$((?:\\[\s\S]|[^\\$]|\$(?!\$))+?)\$\$/u

function formula(src, block) {
  if (!src.startsWith('$')) return
  const display = src.startsWith('$$')
  if (block && !display) return
  const pattern = display ? displayDollar : inlineDollar
  const match = pattern.exec(src)
  if (!match || !match[1].trim()) return
  let raw = match[0]
  if (block) {
    const end = /^[ \t]*(?:\n|$)/.exec(src.slice(raw.length))
    if (!end) return
    raw += end[0]
  }
  return {type:'equation',raw,tex:match[1],display}
}

// Marked searches ahead for the end of emphasis. Hide stars and underscores
// inside equations from that search while keeping all source offsets intact.
export function maskEquationEmphasis(src) {
  if (!/[*_]/.test(src)) return src
  const masked = []
  let offset = 0
  for (const match of src.matchAll(/\$/g)) {
    if (match.index < offset) continue
    const token = formula(src.slice(match.index),false)
    if (!token) continue
    masked.push(src.slice(offset,match.index),'x'.repeat(token.raw.length))
    offset = match.index + token.raw.length
  }
  return masked.join('')+src.slice(offset)
}

export const mathExtensions = [
  {
    name:'displayEquation',level:'block',
    start(src) {
      const index = src.indexOf('\n$$')
      return index < 0 ? undefined : index+1
    },
    tokenizer(src) { return formula(src,true) }
  },
  {
    name:'inlineEquation',level:'inline',
    start(src) { return src.indexOf('$') },
    tokenizer(src) { return formula(src,false) }
  }
]

const rendered = new WeakMap()
export function appendEquation(parent, token) {
  if (!rendered.has(token)) {
    const node = document.createElement('span')
    node.className = token.display ? 'note-equation display' : 'note-equation'
    try {
      render(token.tex,node,{output:'mathml',displayMode:token.display,trust:false,
        throwOnError:true,strict:'error',maxExpand:250,maxSize:12})
      rendered.set(token,node)
    } catch {
      // Keep an incomplete or unsupported equation editable and visible.
      rendered.set(token,null)
    }
  }
  const node = rendered.get(token)
  if (!node) { parent.append(token.raw); return }
  parent.append(node.cloneNode(true))
}
