import { cp, mkdir, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const out = path.join(root, 'dist')
await rm(out, { recursive: true, force: true })
await cp(path.join(root, 'extension'), out, { recursive: true })
for (const name of ['LICENSE', 'NOTICE', 'THIRD_PARTY_NOTICES.md', 'licenses']) {
  await cp(path.join(root, name), path.join(out, name), { recursive: true })
}
await cp(path.join(root, 'docs/annotation-migration.md'), path.join(out, 'ANNOTATIONS.md'))
const vendor = path.join(out, 'vendor')
await mkdir(vendor)
const pdfjs = path.join(root, 'node_modules/pdfjs-dist')
for (const name of ['build/pdf.min.mjs', 'build/pdf.worker.min.mjs', 'cmaps', 'standard_fonts', 'wasm', 'iccs']) {
  await cp(path.join(pdfjs, name), path.join(vendor, path.basename(name)), { recursive: true })
}
await cp(path.join(pdfjs, 'LICENSE'), path.join(vendor, 'PDFJS-LICENSE'))
await cp(path.join(root, 'node_modules/pdf-lib/dist/pdf-lib.esm.min.js'), path.join(vendor, 'pdf-lib.mjs'))
await cp(path.join(root, 'node_modules/pdf-lib/LICENSE.md'), path.join(vendor, 'PDF-LIB-LICENSE.md'))
const dependencyNotices = path.join(vendor, 'licenses')
await mkdir(dependencyNotices)
for (const [source, destination] of [
  ['@pdf-lib/standard-fonts/LICENSE.md', 'standard-fonts.txt'],
  ['@pdf-lib/upng/LICENSE', 'upng.txt'],
  ['pako/LICENSE', 'pako.txt'],
  ['pako/lib/zlib/README', 'pako-zlib.txt']
]) {
  await cp(path.join(root, 'node_modules', source), path.join(dependencyNotices, destination))
}
console.log('Load the dist/ directory as an unpacked Chromium extension.')
