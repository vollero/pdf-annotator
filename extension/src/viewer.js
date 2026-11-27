import { getDocument, GlobalWorkerOptions, TextLayer } from '../vendor/pdf.min.mjs'
import { paintMark, shape } from './annotations.js'

const asset = file => new URL('../vendor/'+file,import.meta.url).href
GlobalWorkerOptions.workerSrc=asset('pdf.worker.min.mjs')

export function readPDF(bytes) {
  return getDocument({
    data:bytes.slice(),isEvalSupported:false,enableXfa:false,
    cMapUrl:asset('cmaps/'),cMapPacked:true,standardFontDataUrl:asset('standard_fonts/'),
    wasmUrl:asset('wasm/'),iccUrl:asset('iccs/')
  }).promise
}

const $=id=>document.getElementById(id)
export class Viewer {
  constructor({onPage, onError}) {
    this.onPage = onPage
    this.onError = onError
    this.page = 1
    this.zoom = null
    this.marks = []
    this.sheets = []
    this.nearby = new Set()
    this.thumbs = new Map()
    this.scroller = $('scroller')
    this.stack = $('sheets')
    this.observer = new IntersectionObserver(entries => {
      for (const entry of entries) this.thumbnail(entry.target, entry.isIntersecting)
    }, {root: $('thumbnails'), rootMargin: '180px'})

    // Keep page-sized placeholders in the document; allocate canvases only near the reader.
    this.pageObserver = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const sheet = this.sheetFor(entry.target)
        if (!sheet) continue
        if (entry.isIntersecting) {
          this.nearby.add(sheet)
          this.renderSheet(sheet)
        } else {
          this.nearby.delete(sheet)
          this.release(sheet)
        }
      }
    }, {root: this.scroller, rootMargin: '250px 0px'})
    this.resize = new ResizeObserver(() => this.redrawVisible())
    this.resize.observe(this.scroller)
    this.scroller.addEventListener('scroll', () => {
      if (this.scrollFrame) return
      this.scrollFrame = requestAnimationFrame(() => {
        this.scrollFrame = 0
        this.trackPage()
      })
    }, {passive: true})
  }

  sheetFor(element) {
    const sheet = this.sheets[Number(element.dataset.page) - 1]
    return sheet?.element === element ? sheet : null
  }

  get currentSheet() { return this.sheets[this.page - 1] }
  get continuous() { return this.stack.dataset.layout === 'continuous' }

  setDocument(pdf, marks) {
    const previous = this.pdf
    this.observer.disconnect()
    this.pageObserver.disconnect()
    for (const sheet of this.nearby) this.release(sheet)
    this.nearby.clear()
    this.thumbs.clear()
    this.pdf = pdf
    this.marks = marks
    this.sheets = []
    this.page = 1
    this.zoom = null
    this.stack.classList.remove('manual-zoom')
    this.stack.style.removeProperty('--page-width')
    this.stack.style.removeProperty('--page-ratio')
    const pages = document.createDocumentFragment()
    const thumbnails = document.createDocumentFragment()
    for (let number = 1; number <= pdf.numPages; number++) {
      const element = document.createElement('div')
      element.className = 'paper'
      element.dataset.page = number
      element.setAttribute('role', 'group')
      element.setAttribute('aria-label', 'Page ' + number)
      this.sheets.push({number, element})
      pages.append(element)
      const button = document.createElement('button')
      button.className = 'thumbnail'
      button.dataset.page = number
      button.setAttribute('aria-label', 'Go to page ' + number)
      const preview = document.createElement('span')
      const label = document.createElement('span')
      preview.className = 'sheet'
      label.textContent = 'Page ' + number
      button.append(preview, label)
      thumbnails.append(button)
      this.observer.observe(button)
      this.pageObserver.observe(element)
    }
    this.stack.replaceChildren(pages)
    $('thumbnails').replaceChildren(thumbnails)
    $('thumbnails').scrollTop = 0
    $('total').textContent = $('page-count').textContent = pdf.numPages
    this.go(1)
    if (previous && previous !== pdf) previous.destroy().catch(() => {})
  }

  async thumbnail(button,visible) {
    if(!visible) {
      this.thumbs.get(button)?.task?.cancel()
      this.thumbs.delete(button)
      button.firstChild.replaceChildren()
      return
    }
    if(this.thumbs.has(button)) return
    const entry={}, pdf=this.pdf
    this.thumbs.set(button,entry)
    try {
      const page=await pdf.getPage(+button.dataset.page)
      if(this.thumbs.get(button)!==entry) return
      const base=page.getViewport({scale:1})
      const viewport=page.getViewport({scale:184/base.width})
      Object.assign(entry,{base,number:page.pageNumber})
      button.firstChild.style.aspectRatio=base.width+' / '+base.height
      const canvas=document.createElement('canvas')
      canvas.width=Math.ceil(viewport.width)
      canvas.height=Math.ceil(viewport.height)
      entry.task=page.render({canvas,viewport})
      await entry.task.promise
      if(this.thumbs.get(button)!==entry) return
      const svg=shape('svg',{viewBox:'0 0 '+base.width+' '+base.height,'aria-hidden':'true'})
      button.firstChild.replaceChildren(canvas,svg)
      entry.svg=svg
      this.paintThumb(entry)
    } catch { /* The main viewer reports document and page errors. */ }
  }

  paintThumb(entry) {
    if(!entry.svg) return
    entry.svg.replaceChildren(...this.marks.filter(m=>m.page===entry.number)
      .map(m=>paintMark(m,entry.base.width,entry.base.height)))
  }

  setMarks(marks) {
    this.marks = marks
    for (const sheet of this.nearby) this.paint(sheet)
    if (this.currentSheet && !this.nearby.has(this.currentSheet)) this.paint(this.currentSheet)
    for (const entry of this.thumbs.values()) this.paintThumb(entry)
  }

  paint(sheet) {
    if (!sheet.ink) return
    sheet.ink.replaceChildren(...this.marks.filter(mark => mark.page === sheet.number)
      .map(mark => paintMark(mark, sheet.base.width, sheet.base.height)))
  }

  activate(number) {
    this.currentSheet?.element.classList.remove('current')
    this.page = number
    this.currentSheet.element.classList.add('current')
    $('current').textContent = number
    $('prev').disabled = number === 1
    $('next').disabled = number === this.sheets.length
    const nav = $('thumbnails')
    nav.querySelector('[aria-current]')?.removeAttribute('aria-current')
    const button = nav.children[number - 1]
    button.setAttribute('aria-current', 'page')
    if (nav.clientHeight) button.scrollIntoView({block: 'nearest'})
    this.updateZoomControls()
    this.onPage(number)
  }

  async go(number) {
    const sheet = this.sheets[number - 1]
    if (!sheet) return
    this.activate(number)
    const padding = parseFloat(getComputedStyle(this.scroller).paddingTop)
    const top = sheet.element.getBoundingClientRect().top - this.scroller.getBoundingClientRect().top
    this.scroller.scrollTo(0, this.continuous ? this.scroller.scrollTop + top - padding : 0)
    this.lastScrollTop = this.scroller.scrollTop
    await this.renderSheet(sheet)
  }

  trackPage() {
    const scroller = this.scroller
    if (!this.continuous || !this.sheets.length || this.lastScrollTop === scroller.scrollTop) return
    this.lastScrollTop = scroller.scrollTop
    const last = this.sheets.length - 1
    let low = 0, high = last
    if (scroller.scrollTop <= 0) high = 0
    else if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1) low = last
    else {
      const line = scroller.getBoundingClientRect().top + scroller.clientHeight / 3
      while (low < high) {
        const mid = Math.floor((low + high) / 2)
        if (this.sheets[mid].element.getBoundingClientRect().bottom < line) low = mid + 1
        else high = mid
      }
    }
    if (this.page !== low + 1) this.activate(low + 1)
  }

  // Retain the point being read when the page stack, available width, or zoom changes.
  preservePosition(change) {
    const paper = this.currentSheet?.element
    const before = paper?.getBoundingClientRect()
    const view = this.scroller.getBoundingClientRect()
    if (!before?.width || !before.height) { change(); return }
    const x = Math.min(before.right, Math.max(before.left, view.left + view.width / 2))
    const y = Math.min(before.bottom, Math.max(before.top, view.top + parseFloat(getComputedStyle(this.scroller).paddingTop)))
    const u = (x - before.left) / before.width
    const v = (y - before.top) / before.height
    change()
    const after = paper.getBoundingClientRect()
    const nextView = this.scroller.getBoundingClientRect()
    this.scroller.scrollBy(after.left + u * after.width - (nextView.left + (x - view.left) / view.width * nextView.width),
      after.top + v * after.height - (nextView.top + y - view.top))
    this.lastScrollTop = this.scroller.scrollTop
  }

  setLayout(layout) {
    if (this.stack.dataset.layout === layout) return
    this.preservePosition(() => { this.stack.dataset.layout = layout })
    this.redrawVisible()
  }

  get scale() {
    const sheet = this.currentSheet
    if (!sheet?.base) return null
    return this.zoom ?? sheet.element.getBoundingClientRect().width / sheet.base.width
  }

  changeZoom(step) {
    const scale = this.scale
    if (!scale) return
    this.preservePosition(() => {
      this.zoom = step === 0 ? null : Math.max(.15, Math.min(5, scale * (step < 0 ? .8 : 1.25)))
      this.stack.classList.toggle('manual-zoom', this.zoom !== null)
      this.stack.style.setProperty('--zoom', this.zoom ?? 1)
    })
    this.redrawVisible()
  }

  updateZoomControls() {
    const scale = this.scale
    $('zoom-value').textContent = scale ? Math.round(scale * 100) + '%' : '–'
    $('zoom-in').disabled = !scale || scale >= 5
    $('zoom-out').disabled = !scale || scale <= .15
    $('fit').disabled = !scale
  }

  redrawVisible() {
    for (const sheet of this.nearby) this.renderSheet(sheet)
    if (this.currentSheet) this.renderSheet(this.currentSheet)
    this.updateZoomControls()
  }

  release(sheet) {
    sheet.job?.task?.cancel()
    sheet.job?.layer?.cancel()
    sheet.job = null
    sheet.ink = null
    sheet.element.dataset.ready = 'false'
    sheet.element.replaceChildren()
  }

  renderSheet(sheet) {
    const width = sheet.element.getBoundingClientRect().width
    if (!width) return
    if (sheet.job?.width === width) return sheet.job.promise
    this.release(sheet)
    const job = {width}
    sheet.job = job
    job.promise = this.drawSheet(sheet, job)
    return job.promise
  }

  async drawSheet(sheet, job) {
    const element = sheet.element
    const valid = () => sheet.job === job && this.sheetFor(element) === sheet
    try {
      const page = await this.pdf.getPage(sheet.number)
      if (!valid()) return
      if (!sheet.base) {
        sheet.base = page.getViewport({scale: 1})
        this.preservePosition(() => {
          const setSize = target => {
            target.style.setProperty('--page-width', sheet.base.width + 'px')
            target.style.setProperty('--page-ratio', sheet.base.width + ' / ' + sheet.base.height)
          }
          setSize(element)
          if (sheet.number === 1) setSize(this.stack)
        })
      }
      job.width = element.getBoundingClientRect().width
      if (!job.width) { this.release(sheet); return }
      const scale = job.width / sheet.base.width
      const viewport = page.getViewport({scale})
      const ratio = Math.min(devicePixelRatio || 1, 8192 / Math.max(viewport.width, viewport.height),
        Math.sqrt(16000000 / (viewport.width * viewport.height)))
      const canvas = document.createElement('canvas')
      canvas.className = 'page-canvas'
      canvas.setAttribute('aria-hidden', 'true')
      canvas.width = Math.max(1, Math.ceil(viewport.width * ratio))
      canvas.height = Math.max(1, Math.ceil(viewport.height * ratio))
      const text = document.createElement('div')
      text.className = 'textLayer'
      text.style.setProperty('--total-scale-factor', scale * sheet.base.userUnit)
      job.task = page.render({canvas, viewport, transform: [ratio, 0, 0, ratio, 0, 0]})
      job.layer = new TextLayer({container: text, viewport, textContentSource: page.streamTextContent()})
      await Promise.all([job.task.promise, job.layer.render()])
      if (!valid()) return
      sheet.ink = shape('svg', {class: 'ink', viewBox: '0 0 ' + sheet.base.width + ' ' + sheet.base.height,
        'aria-label': 'Annotations on page ' + sheet.number})
      element.replaceChildren(canvas, text, sheet.ink)
      this.paint(sheet)
      delete element.dataset.error
      element.dataset.ready = 'true'
      if (this.currentSheet === sheet) this.updateZoomControls()
    } catch (error) {
      if (valid()) {
        element.dataset.error = 'true'
        this.onError('Page ' + sheet.number + ' could not be rendered. ' + error.message)
      }
    }
  }
}
