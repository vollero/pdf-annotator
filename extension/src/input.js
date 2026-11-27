// PDF.js, the editable draft and pdf-lib can each hold a copy of a document.
export const maxFileBytes = 64 * 1024 * 1024
export const maxPages = 3000
export class DocumentLimitError extends Error {
  constructor(message) { super(message); this.name = 'DocumentLimitError' }
}
export function checkFileSize(size) {
  if (size > maxFileBytes) throw new DocumentLimitError('Margin can open PDFs up to 64 MiB.')
}

export async function readResponse(response, limit = maxFileBytes) {
  const reader = response.body?.getReader()
  if (!reader) throw new Error('Empty response')
  const buffer = new ArrayBuffer(0, {maxByteLength:limit})
  const target = new Uint8Array(buffer)
  let size = 0
  try {
    if (Number(response.headers.get('content-length')) > limit) throw new DocumentLimitError('Margin can open PDFs up to 64 MiB.')
    while (true) {
      const {done, value} = await reader.read()
      if (done) break
      const next = size + value.byteLength
      if (next > limit) throw new DocumentLimitError('Margin can open PDFs up to 64 MiB.')
      if (next > buffer.byteLength) {
        buffer.resize(Math.min(limit, Math.max(next, 65536, buffer.byteLength * 2)))
      }
      target.set(value,size)
      size = next
    }
  } catch (error) {
    await reader.cancel().catch(() => {})
    throw error
  } finally { reader.releaseLock() }
  return new Uint8Array(buffer.transferToFixedLength(size))
}
