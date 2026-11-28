function validLabel(value,limit) {
  return typeof value === 'string' && value.length > 0 && value.length <= limit &&
    value === value.trim().normalize('NFC') && !/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(value)
}

export const validAuthor = value=>validLabel(value,100)
export function validTags(tags) {
  return Array.isArray(tags) && tags.length > 0 && tags.length <= 16 &&
    tags.every(tag=>validLabel(tag,40) && !tag.includes(',') && !tag.startsWith('#')) &&
    new Set(tags.map(tag=>tag.toLowerCase())).size === tags.length
}

export function parseTags(input) {
  const tags = new Map()
  for (const part of input.split(',')) {
    const tag = part.trim().replace(/^#/u,'').trim().normalize('NFC')
    if (tag && !tags.has(tag.toLowerCase())) tags.set(tag.toLowerCase(),tag)
  }
  const result = [...tags.values()]
  if (result.length && !validTags(result)) throw new Error('Use up to 16 comma-separated tags, each up to 40 characters on one line.')
  return result
}

export function commentByline(mark) {
  return [mark.author && 'By '+mark.author,...(mark.tags ?? []).map(tag=>'#'+tag)].filter(Boolean).join(' · ')
}
