import assert from 'node:assert/strict'

export async function checkActionNotes(page) {
  const filter = page.getByRole('combobox',{name:'Filter by action status'})
  const card = page.locator('.card').filter({hasText:'Reviewed in Chromium'})
  const box = card.getByRole('checkbox')
  assert.equal(await box.isChecked(),false)
  assert.equal(await page.locator('.card').filter({hasText:'Compare the ridge'}).getByRole('checkbox').count(),0)
  await filter.selectOption('todo')
  assert.equal(await page.locator('.card').count(),1)
  await box.focus()
  await page.keyboard.press('Space')
  await page.getByText('No actions to do.',{exact:true}).waitFor()
  assert.ok(await filter.evaluate(el => el === document.activeElement))
  assert.equal(await filter.locator('option[value="done"]').textContent(),'Done (1)')
  await filter.selectOption('done')
  assert.ok(await box.isChecked())
  await page.locator('#undo').click()
  await page.getByText('No completed actions.',{exact:true}).waitFor()
  await page.locator('#redo').click()
  assert.ok(await box.isChecked())
  await filter.selectOption('all')

  // Two reviewers in the same profile can edit the wording and the checkbox independently.
  const second = await page.context().newPage()
  try {
    await second.goto(page.url())
    const copy = second.locator('.card').filter({hasText:'Reviewed in Chromium'})
    await copy.locator('.more').click()
    await copy.getByRole('button',{name:'Edit note'}).click()
    await second.locator('#note-text').fill('Reviewed in Chromium — revised 注釈')
    await Promise.all([box.uncheck(),second.getByRole('button',{name:'Save note'}).click()])
    await page.waitForFunction(() => {
      const card = [...document.querySelectorAll('.card')].find(c => c.textContent.includes('revised 注釈'))
      return card && !card.querySelector('input').checked && document.querySelector('#save-state').textContent === 'Saved locally'
    })
    await box.check()
    await second.waitForFunction(() => document.querySelector('.card-check')?.checked)
  } finally { await second.close() }
}
