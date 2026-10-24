/** Regenerate the four Chrome icons reproducibly from committed branding PNGs.
 * branding/icon.svg is the editable vector artwork; if it changes, export
 * 16/32/48/128 PNGs back into branding/ before running this script.
 * This avoids new rasterizer dependencies in the default Node build.
 */
import { copyFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dest = join(root, 'public', 'icons')
mkdirSync(dest, { recursive: true })
for (const size of [16,32,48,128]) {
  const source = join(root, 'branding', `icon${size}.png`)
  if (!existsSync(source)) throw new Error(`Missing branding PNG ${source}`)
  copyFileSync(source, join(dest, `icon${size}.png`))
}
console.log('Generated Chrome icons from branding snapshots')
