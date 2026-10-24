import * as esbuild from 'esbuild'
import { copyFile, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const pdfjs = join(root, 'node_modules', 'pdfjs-dist')

await rm(dist, { recursive: true, force: true })
await mkdir(join(dist, 'assets'), { recursive: true })
await mkdir(join(dist, 'licenses'), { recursive: true })

await esbuild.build({
  absWorkingDir: root,
  entryPoints: ['src/viewer.js'],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['chrome120'],
  outfile: join(dist, 'assets', 'viewer.js'),
  legalComments: 'eof',
  minify: false,
  logLevel: 'info',
})

await copyFile(join(root, 'src', 'viewer.css'), join(dist, 'assets', 'viewer.css'))
await copyFile(join(root, 'viewer.html'), join(dist, 'viewer.html'))
await copyFile(join(root, 'README.md'), join(dist, 'README.md'))
await copyFile(join(root, 'public', 'manifest.json'), join(dist, 'manifest.json'))
await copyFile(join(root, 'public', 'background.js'), join(dist, 'background.js'))
await cp(join(root, 'public', 'icons'), join(dist, 'icons'), { recursive: true })
await cp(join(root, 'public', 'riot'), join(dist, 'riot'), { recursive: true })
await copyFile(join(pdfjs, 'build', 'pdf.worker.min.mjs'), join(dist, 'pdf.worker.min.mjs'))
await cp(join(pdfjs, 'cmaps'), join(dist, 'cmaps'), { recursive: true })
await cp(join(pdfjs, 'standard_fonts'), join(dist, 'standard_fonts'), { recursive: true })
await copyFile(join(pdfjs, 'LICENSE'), join(dist, 'licenses', 'pdfjs-LICENSE'))
await copyFile(join(root, 'node_modules', 'pdf-lib', 'LICENSE.md'), join(dist, 'licenses', 'pdf-lib-LICENSE.md'))

const manifest = JSON.parse(await readFile(join(dist, 'manifest.json'), 'utf8'))
if (manifest.name !== 'PDF Ping Wheel' || manifest.manifest_version !== 3) {
  throw new Error('manifest is not the MV3 PDF Ping Wheel package')
}
const html = await readFile(join(dist, 'viewer.html'), 'utf8')
if (!html.includes('./assets/viewer.js')) throw new Error('viewer.html is not wired to the bundle')
await writeFile(join(dist, 'licenses', 'NOTICE.txt'), 'PDF.js is Apache-2.0. pdf-lib is MIT. Both are bundled locally.\n')
console.log('built', dist)
