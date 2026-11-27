// Keep the secondary PDF parser off the editor thread, including for ordinary exports.
export function runPdfJob(request, signal) {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted()
    const worker = new Worker(new URL('./pdf-worker.js', import.meta.url), {type: 'module'})
    const abort = () => finish(reject, signal.reason)
    const timer = setTimeout(() => finish(reject, new Error('PDF processing timed out.')), 60000)
    function finish(done, value) {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      worker.terminate()
      done(value)
    }
    signal?.addEventListener('abort', abort, {once: true})
    worker.onmessage = ({data}) => {
      if (data.error) {
        const error = new Error(data.error.message)
        error.name = data.error.name
        finish(reject, error)
      } else finish(resolve, data.result)
    }
    worker.onerror = () => finish(reject, new Error('PDF processing failed.'))
    try { worker.postMessage(request) } catch (error) { finish(reject, error) }
  })
}
