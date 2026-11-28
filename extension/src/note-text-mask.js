// Canvas has no tab-size setting. Expand tabs before wrapping each source line.
function expandCodeTabs(text) {
  let result = '', column = 0
  for (const character of text) {
    const width = character === '\t' ? 4 - column % 4 : 1
    result += character === '\t' ? ' '.repeat(width) : character
    column = character === '\n' ? 0 : column + width
  }
  return result
}

// PDF standard fonts do not cover every script a note can contain. Use the
// browser's font fallback for the visible glyphs and keep full Unicode Contents.
export function noteTextMask(runs, width, height, {fontSize, fontFamily}) {
  const scale = Math.min(2,1024/width,1024/height)
  const canvas = new OffscreenCanvas(Math.max(1,Math.ceil(width*scale)),Math.max(1,Math.ceil(height*scale)))
  const ctx = canvas.getContext('2d',{willReadFrequently:true})
  ctx.scale(canvas.width/width,canvas.height/height)
  ctx.beginPath()
  ctx.rect(5,4,Math.max(0,width-10),Math.max(0,height-8))
  ctx.clip()
  let line = [], start = 0, used = 0, baseline = 4+fontSize
  function flush() {
    if (line.length) ctx.fillText(line.join(''),5+start,baseline)
    line = []
    start = used
  }
  function finishLine() {
    flush()
    start = 0
    used = 0
    baseline += fontSize*1.25
  }
  const available = width-10
  for (const run of runs) {
    if (baseline-fontSize >= height-4) break
    if (run.codeBlock && used) finishLine()
    const font = (run.em ? 'italic ' : '') + (run.strong ? 'bold ' : '') +
      (run.code ? fontSize*.9+'px monospace' : fontSize+'px '+fontFamily)
    if (font !== ctx.font) { flush(); ctx.font = font }
    const text = run.codeBlock && run.text.includes('\t') ? expandCodeTabs(run.text) : run.text
    for (const [token] of text.matchAll(/\n|[^\S\n]{1,256}|[^\s]{1,256}/gu)) {
      if (baseline-fontSize >= height-4) break
      if (token==='\n') { finishLine(); continue }
      const measured = ctx.measureText(token).width
      if (used && used+measured>available) {
        finishLine()
        if (!run.codeBlock && !token.trim()) continue
      }
      if (measured<=available) {
        line.push(token)
        used += measured
      } else {
        for (const char of token) {
          const advance = ctx.measureText(char).width
          if (used && used+advance>available) finishLine()
          if (baseline-fontSize >= height-4) break
          line.push(char)
          used += advance
        }
      }
    }
  }
  flush()
  const {data} = ctx.getImageData(0,0,canvas.width,canvas.height)
  const stride = Math.ceil(canvas.width/8)
  const bytes = new Uint8Array(stride*canvas.height).fill(255)
  for (let y=0; y<canvas.height; y++) {
    for (let x=0; x<canvas.width; x++) {
      if (data[(y*canvas.width+x)*4+3]>=96) bytes[y*stride+(x>>3)] &= ~(128>>(x%8))
    }
  }
  return {bytes,width:canvas.width,height:canvas.height}
}
