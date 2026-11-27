import assert from 'node:assert/strict'
import { readFile, readdir, stat } from 'node:fs/promises'
import test from 'node:test'

test('the packaged extension contains its project license and the notices named in its index', async () => {
  const metadata = JSON.parse(await readFile('package.json', 'utf8'))
  const lock = JSON.parse(await readFile('package-lock.json', 'utf8'))
  assert.equal(metadata.license, 'Apache-2.0')
  assert.equal(lock.packages[''].license, metadata.license)

  for (const name of ['LICENSE', 'NOTICE', 'THIRD_PARTY_NOTICES.md']) {
    assert.deepEqual(await readFile('dist/' + name), await readFile(name))
  }
  const index = await readFile('dist/THIRD_PARTY_NOTICES.md', 'utf8')
  const paths = Array.from(index.matchAll(/`((?:licenses|vendor)\/[^`]+)`/g), match => match[1])
  assert.ok(paths.length > 0)
  for (const file of new Set(paths)) {
    assert.ok((await stat('dist/' + file)).isFile(), file)
  }
  for (const file of await readdir('licenses')) {
    assert.deepEqual(await readFile('dist/licenses/' + file), await readFile('licenses/' + file))
  }
})
