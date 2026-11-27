import { readFile, writeFile } from 'node:fs/promises'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

const doc = await PDFDocument.create()
doc.setTitle('Reading the Alps')
doc.setAuthor('Margin')
doc.setSubject('An illustrated sample document for the Margin PDF workspace')
const fonts = await Promise.all([StandardFonts.TimesRoman, StandardFonts.TimesRomanItalic, StandardFonts.Helvetica, StandardFonts.HelveticaBold].map(f => doc.embedFont(f)))
const [serif, italic, sans, bold] = fonts
const photo = await doc.embedJpg(await readFile(new URL('alpine-ridge.jpg', import.meta.url)))
const w = 612, h = 792, left = 46
const charcoal = rgb(.15,.16,.14), grey = rgb(.38,.39,.35), rust = rgb(.62,.28,.15), line = rgb(.78,.79,.75)
let page
const marks = []
function text(str, x, top, size = 13, font = serif, color = charcoal) {
  page.drawText(str, { x, y: h - top, size, font, color })
}
function rule(x1, y1, x2, y2, color = line, thickness = .65) {
  page.drawLine({ start: {x: x1, y: h - y1}, end: {x: x2, y: h - y2}, thickness, color })
}
function heading(num, section, title) {
  page = doc.addPage([w,h])
  const logo = [[46,40],[52,30],[56,36],[60,29],[68,40],[46,40]]
  for (let i=1; i<logo.length; i++) rule(...logo[i-1],...logo[i],rust,1.4)
  text('FIELDWORK',75,39.5,9,bold)
  text('LANDSCAPE STUDIES   /   VOL. 01',432,39,8,sans,grey)
  rule(left,52,566,52)
  text(section,left,92,9,bold,rust)
  text(title,left,149,48,serif)
  rule(left,737,566,737)
  text('FIELDWORK   /   ALPINE SERIES',left,757,8,sans,grey)
  text('0'+num+'   /   03',533,757,8,sans,grey)
}
function body(lines, y) { lines.forEach((s,i)=>text(s,left,y+i*18,13)) }
function highlighted(str, x, y, size, font, pageNumber, color, id) {
  marks.push({ id, type:'highlight', page:pageNumber, color, text:str,
    rects:[[ (x-1.5)/w, (y-size*.8)/h, (font.widthOfTextAtSize(str,size)+3)/w, (size*1.02)/h ]] })
}
heading(1,'FIELD GUIDE   /   001','Reading the Alps')
const lead = 'Every ridge holds a record of the forces that shaped it.'
text(lead,left,180,16,italic,grey)
text('Field observations from the high limestone ranges.',left,201,16,italic,grey)
highlighted(lead,left,180,16,italic,1,'#efc650','sample-ridge')
page.drawImage(photo,{x:left,y:h-428,width:520,height:198})
text('FIG. 01',left,444,8,bold,rust)
text('Limestone towers above the alpine forest line.',83,444,9,italic,grey)
rule(left,463,566,463)
text('01',left,500,12,sans,rust)
text('The shape of a ridgeline',75,501,24,serif)
body(['Begin with the skyline. From a distance, the mountains appear to rise in a',
      'single wall. Look a little longer and the wall separates into towers, notches,',
      'and shoulders. Each edge belongs to a different plane of rock.'],531)
body(['A field sketch makes those planes easier to see. Follow one contour with',
      'your eye, from the dark forest below to the pale crest above. Mark the',
      'changes in angle before adding the smaller details of the face.'],608)
marks.push({id:'sample-note',type:'note',page:1,color:'#91b9dd',text:'Compare the ridge in this photograph with the profile on page 2.',point:[.875,.32]})
heading(2,'FIELD GUIDE   /   002','Lines in the rock')
text('A profile study of a limestone ridge.',left,182,16,italic,grey)
page.drawRectangle({x:left,y:h-387,width:520,height:173,color:rgb(.95,.94,.90)})
const profile=[[57,362],[99,342],[143,298],[158,310],[191,263],[199,274],[204,249],[217,254],[224,279],[240,284],[259,319],[278,307],[308,265],[322,271],[348,235],[363,252],[391,261],[408,292],[447,302],[469,282],[489,312],[531,333],[555,349]]
for(let i=1;i<profile.length;i++) rule(...profile[i-1],...profile[i],charcoal,1.5)
for (const [x,y] of profile.slice(2,-2).filter((_,i)=>i%3===0)) {
  rule(x,y+6,x-14,y+34,grey,.75)
  rule(x-14,y+34,x-25,y+71,grey,.55)
}
text('RIDGE PROFILE   /   LOOKING NORTH',58,376,7,sans,grey)
text('FIG. 02',left,405,8,bold,rust)
text('A contour study, with the foreground omitted.',83,405,9,italic,grey)
text('02',left,466,12,sans,rust)
text('A patient observation',75,467,24,serif)
const key='Trace the crest before filling in the shadow.'
body([key,'Begin at a recognizable notch. Work outward in both directions, checking',
      'the lengths of the slopes against their angles. Record where the light',
      'strikes the upper beds and where the face turns away.'],499)
highlighted(key,left,499,13,serif,2,'#9abd9e','sample-contour')
body(['Return to the same view later in the day. The rocks hold their positions,',
      'but the boundaries between light and shadow move across them. Compare',
      'both sketches to find the structures that remain.'],609)
heading(3,'FIELD GUIDE   /   003','Observation log')
text('Notes to record at a viewpoint.',left,182,16,italic,grey)
let top=244
for(const [title,detail] of [
  ['Location and conditions','Record the viewpoint, direction of travel, weather, and time of day.'],
  ['Landforms','Describe the ridge, the valley floor, and the transition between them.'],
  ['Light and texture','Look for changes in tone, bedding, fractures, and areas of scree.'],
  ['Questions for a return visit','Record one feature to revisit from a second viewpoint.']
]) {
  text(title,left,top,20,serif)
  text(detail,left,top+21,12,italic,grey)
  rule(left,top+50,566,top+50)
  rule(left,top+73,566,top+73)
  top+=116
}
const dest = new URL('../../extension/assets/',import.meta.url)
await writeFile(new URL('reading-the-alps.pdf',dest),await doc.save())
await writeFile(new URL('sample-annotations.json',dest),JSON.stringify(marks,null,2)+'\n')
