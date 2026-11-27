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
  constructor({onPage,onError}) {
    this.onPage=onPage
    this.onError=onError
    this.marks=[]
    this.sequence=0
    this.zoom=null
    this.page=1
    this.thumbs=new Map()
    this.observer=new IntersectionObserver(entries=>{
      for(const entry of entries) this.thumbnail(entry.target,entry.isIntersecting)
    },{root:$('thumbnails'),rootMargin:'180px'})
    this.resize=new ResizeObserver(entries=>{
      const width=entries[0].contentRect.width
      if (width===this.lastWidth) return
      this.lastWidth=width
      if(this.pdf && this.zoom===null) this.render()
    })
    this.resize.observe($('scroller'))
  }

  setDocument(pdf,marks) {
    const previous=this.pdf
    this.pdf=pdf
    this.marks=marks
    this.page=1
    this.zoom=null
    this.observer.disconnect()
    this.thumbs.clear()
    const nav=$('thumbnails'), frag=document.createDocumentFragment()
    for(let i=1;i<=pdf.numPages;i++) {
      const button=document.createElement('button')
      button.className='thumbnail'
      button.dataset.page=i
      button.setAttribute('aria-label','Go to page '+i)
      const sheet=document.createElement('span'),label=document.createElement('span')
      sheet.className='sheet'; label.textContent='Page '+i
      button.append(sheet,label)
      frag.append(button)
      this.observer.observe(button)
    }
    nav.replaceChildren(frag)
    nav.scrollTop=0
    this.go(1)
    if(previous && previous!==pdf) previous.destroy().catch(()=>{})
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
    this.marks=marks
    this.paint()
    for(const entry of this.thumbs.values()) this.paintThumb(entry)
  }

  paint() {
    if(!this.base) return
    $('ink').replaceChildren(...this.marks.filter(m=>m.page===this.page)
      .map(m=>paintMark(m,this.base.width,this.base.height)))
  }

  async go(number) {
    if(!this.pdf || number<1 || number>this.pdf.numPages) return
    this.page=number
    $('current').textContent=number
    $('total').textContent=$('page-count').textContent=this.pdf.numPages
    $('prev').disabled=number===1
    $('next').disabled=number===this.pdf.numPages
    const nav=$('thumbnails')
    nav.querySelector('[aria-current]')?.removeAttribute('aria-current')
    const button=nav.children[number-1]
    button.setAttribute('aria-current','page')
    button.scrollIntoView({block:'nearest'})
    this.onPage(number)
    await this.render(true)
  }

  changeZoom(step) {
    if(!this.base || !this.scale) return
    this.zoom=step===0 ? null : Math.max(.15,Math.min(5,this.scale*(step<0?.8:1.25)))
    this.render()
  }

  async render(resetScroll=false) {
    if(!this.pdf) return
    const seq=++this.sequence
    this.task?.cancel()
    this.layer?.cancel()
    const paper=$('paper'), scroller=$('scroller')
    paper.dataset.ready='false'
    if(resetScroll) { paper.hidden=true; scroller.scrollTo(0,0) }
    try {
      const page=await this.pdf.getPage(this.page)
      if(seq!==this.sequence) return
      const base=page.getViewport({scale:1})
      const style=getComputedStyle(scroller)
      const available=scroller.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight)
      const scale=this.zoom ?? Math.max(50,available)/base.width
      const viewport=page.getViewport({scale})
      const ratio=Math.min(window.devicePixelRatio||1,8192/Math.max(viewport.width,viewport.height),Math.sqrt(16000000/(viewport.width*viewport.height)))
      const canvas=document.createElement('canvas')
      canvas.id='page-canvas'; canvas.setAttribute('aria-hidden','true')
      canvas.width=Math.max(1,Math.ceil(viewport.width*ratio))
      canvas.height=Math.max(1,Math.ceil(viewport.height*ratio))
      const layer=document.createElement('div')
      layer.className='textLayer'; layer.id='text-layer'
      layer.style.setProperty('--total-scale-factor',scale*base.userUnit)
      const task=this.task=page.render({canvas,viewport,transform:[ratio,0,0,ratio,0,0]})
      const textLayer=this.layer=new TextLayer({container:layer,viewport,textContentSource:page.streamTextContent()})
      await Promise.all([task.promise,textLayer.render()])
      if(seq!==this.sequence) return
      this.base=base; this.scale=scale
      paper.style.width=viewport.width+'px'; paper.style.height=viewport.height+'px'
      $('page-canvas').replaceWith(canvas); $('text-layer').replaceWith(layer)
      $('ink').setAttribute('viewBox','0 0 '+base.width+' '+base.height)
      this.paint()
      $('zoom-value').textContent=Math.round(scale*100)+'%'
      $('zoom-in').disabled=scale>=5; $('zoom-out').disabled=scale<=.15
      paper.hidden=false; paper.dataset.ready='true'
      if(resetScroll) scroller.scrollTo(0,0)
    } catch(error) {
      if(seq===this.sequence) this.onError('This page could not be rendered. '+error.message)
    }
  }
}
