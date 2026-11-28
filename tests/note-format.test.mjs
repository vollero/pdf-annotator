import test from 'node:test'
import assert from 'node:assert/strict'
import { noteTextRuns, readableNoteText } from '../dist/src/note-format.js'

test('note text and styled runs share list order, emphasis, escapes and code literals',()=>{
  const text = '**Read `x*y`** and *check*\n\n3. One\n4. Two\n   - Nested\n\n\\*literal\\*'
  const mark = {text,textFormat:'markdown'}
  assert.equal(readableNoteText({text}),text)
  const expected = 'Read x*y and check\n\n3. One\n4. Two\n  • Nested\n\n*literal*'
  assert.equal(readableNoteText(mark),expected)
  const runs = noteTextRuns(mark,'To do')
  assert.equal(runs.map(run=>run.text).join(''),'To do · '+expected)
  assert.deepEqual(runs.find(run=>run.text==='x*y'),{text:'x*y',strong:true,code:true})
  assert.equal(runs.find(run=>run.text==='check').em,true)
})

test('literal markup and long imported notes keep their source',()=>{
  const text = 'Read <b>this</b> [local](./example) and ![figure](figure.png).'
  assert.equal(readableNoteText({text,textFormat:'markdown'}),text)
  const long = '**note**'.repeat(2000)
  assert.equal(readableNoteText({text:long,textFormat:'markdown'}),long)
})

test('web destinations are readable in PDF comments, expanded boxes and search',()=>{
  const read = text=>readableNoteText({text,textFormat:'markdown'})
  const url = 'https://example.org/docs?q=units&lang=en#mm'
  const note = {text:'[**Units**]('+url+') or <http://example.org>.',textFormat:'markdown'}
  assert.equal(read(note.text),'Units ('+url+') or http://example.org.')
  const runs = noteTextRuns(note)
  assert.equal(runs.map(run=>run.text).join(''),read(note.text))
  assert.deepEqual(runs[0],{text:'Units',strong:true})
  assert.equal(read('[]('+url+')'),url)
  assert.equal(read('[docs][ref]\n\n[ref]: '+url).trim(),'docs ('+url+')')
  assert.equal(read('`[Units]('+url+')`'),'[Units]('+url+')')
  for (const href of ['relative','#page','//example.org','file:///paper.pdf','mailto:me@example.org','data:text/plain,hello','ftp://example.org','https:///broken','https://bad:port']) {
    assert.equal(read('[text]('+href+')'),'[text]('+href+')')
  }
})

test('equations preserve TeX in PDF text, including Markdown punctuation and display boundaries',()=>{
  const formula = '$x_1*y_2*z$'
  const display = '$$\n\\frac{a_1}{b_2}\n$$'
  const text = 'Use *the '+formula+' value*.\n'+display+'\n**End**'
  const mark = {text,textFormat:'markdown'}
  const expected = 'Use the '+formula+' value.\n'+display+'\nEnd'
  assert.equal(readableNoteText(mark),expected)
  assert.equal(noteTextRuns(mark).map(run=>run.text).join(''),expected)
  assert.equal(readableNoteText({text}),text)
  const prices = {text:'Pay $5 or $10. Example: `$x$`.',textFormat:'markdown'}
  assert.deepEqual(noteTextRuns(prices).filter(run=>run.code),[{text:'$x$',code:true}])
})

test('fenced code keeps literal lines, tabs and block boundaries in text and styled runs',()=>{
  const code = '\tif (a < b) {\n    print("**literal**");  \n\n\t}'
  for (const fence of ['```','~~~~']) {
    const text = ['Intro',fence+'js',code,fence,'Next'].join('\n')
    const mark = {text,textFormat:'markdown'}
    const expected = 'Intro\n'+code+'\nNext'
    assert.equal(readableNoteText(mark),expected)
    assert.equal(readableNoteText({text}),text)
    const runs = noteTextRuns(mark)
    assert.deepEqual(runs.filter(run=>run.codeBlock),[{text:code,code:true,codeBlock:true}])
    assert.equal(runs.map(run=>run.text).join(''),expected)
  }
  const read = text=>readableNoteText({text,textFormat:'markdown'})
  assert.equal(read('```\nx\n```\n~~~\ny\n~~~'),'x\ny')
  assert.equal(read('```\nx\n\n```\ny'),'x\n\ny')
  assert.equal(read('~~~\n  incomplete\n'),'  incomplete\n')
  assert.equal(read('    previously literal'),'    previously literal')
})
