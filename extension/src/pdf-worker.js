import { exportDocument, unpack } from './pdf-annotations.js'

self.onmessage = async ({data}) => {
  try {
    if (data.operation === 'unpack') {
      const result = await unpack(data.bytes)
      self.postMessage({result}, [result.bytes.buffer])
    } else if (data.operation === 'export') {
      const result = await exportDocument(data.bytes, data.marks, number => {
        const view = data.views.get(number)
        // The inverse of the PDF.js viewport's affine transformation.
        const [a, b, c, d, e, f] = view.transform
        const det = a * d - b * c
        return {...view, convertToPdfPoint(x, y) {
          return [((x - e) * d - (y - f) * c) / det, ((y - f) * a - (x - e) * b) / det]
        }}
      })
      self.postMessage({result}, [result.buffer])
    }
  } catch (error) {
    self.postMessage({error: {name: error.name, message: error.message}})
  }
}
