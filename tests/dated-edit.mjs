import assert from 'node:assert/strict'

// A real UI edit is timed by Chromium. Also check that an imported undated
// annotation never acquires a fictitious creation date when it is changed.
export function editTime(actual) {
  assert.equal(actual.createdAt,undefined)
  assert.equal(new Date(actual.updatedAt).toISOString(),actual.updatedAt)
  return actual.updatedAt
}
