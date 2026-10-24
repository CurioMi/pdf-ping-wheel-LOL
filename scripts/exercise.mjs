import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { describePingAnnotations, readPingPayload } from '../src/pdf-io.js'
import { PINGS } from '../src/pings.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const mediaDir = '/cursor/stores/bc-e0581c5f-83cf-4f53-9f7f-c171eac580c9/media'
const chromeBin = '/usr/bin/google-chrome'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function hexRgb(hex) {
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const COLORS = Object.fromEntries(PINGS.map((ping) => [ping.id, hexRgb(ping.color)]))

async function fixturePdf(path) {
  const doc = await PDFDocument.create()
  const page = doc.addPage([612, 792])
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  page.drawRectangle({ x: 0, y: 742, width: 612, height: 50, color: rgb(0.12, 0.16, 0.22) })
  page.drawText('Field notes', { x: 48, y: 760, size: 20, font: bold, color: rgb(1, 1, 1) })
  page.drawText('Platform B', { x: 48, y: 690, size: 16, font: bold, color: rgb(0.15, 0.17, 0.22) })
  const lines = [
    'Leave the right side clear for marks.',
    'The wheel stamps the page under the press point.',
    'G places a generic ping; T taps the center emote.',
  ]
  lines.forEach((line, index) => {
    page.drawText(line, { x: 48, y: 650 - index * 24, size: 12, font, color: rgb(0.28, 0.31, 0.35) })
  })
  await writeFile(path, await doc.save())
}

function serve(dir) {
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript',
    '.mjs': 'text/javascript',
    '.css': 'text/css; charset=utf-8',
    '.png': 'image/png',
    '.json': 'application/json',
  }
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1')
      let pathname = decodeURIComponent(url.pathname)
      if (pathname.endsWith('/')) pathname += 'viewer.html'
      const data = await readFile(join(dir, pathname))
      res.setHeader('content-type', types[extname(pathname)] || 'application/octet-stream')
      res.end(data)
    } catch {
      res.statusCode = 404
      res.end('not found')
    }
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }))
  })
}

async function waitJson(url) {
  const start = Date.now()
  while (Date.now() - start < 15000) {
    try {
      const response = await fetch(url)
      if (response.ok) return await response.json()
    } catch { /* chrome still booting */ }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error('devtools port did not open')
}

function connect(wsUrl, logs) {
  const ws = new WebSocket(wsUrl)
  let next = 0
  const pending = new Map()
  const opened = new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve)
    ws.addEventListener('error', () => reject(new Error('devtools websocket failed')))
  })
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data)
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject, timer } = pending.get(msg.id)
      clearTimeout(timer)
      pending.delete(msg.id)
      if (msg.error) reject(new Error(`${msg.error.message || 'cdp error'}`))
      else resolve(msg.result)
      return
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      logs.push(msg.params?.exceptionDetails?.exception?.description || msg.params?.exceptionDetails?.text || 'exception')
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params?.type === 'error') {
      logs.push(msg.params.args.map((arg) => arg.value || arg.description || '').join(' '))
    }
  })
  async function send(method, params = {}, sessionId) {
    await opened
    const id = ++next
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new Error(`timeout ${method}`))
      }, 20000)
      pending.set(id, { resolve, reject, timer })
      const payload = { id, method, params }
      if (sessionId) payload.sessionId = sessionId
      ws.send(JSON.stringify(payload))
    })
  }
  return { send, close: () => ws.close() }
}

async function launchChrome(args) {
  const proc = spawn(chromeBin, args, {
    stdio: ['ignore', 'ignore', 'pipe'],
    env: { ...process.env, DISPLAY: process.env.DISPLAY || ':1' },
  })
  let stderr = ''
  proc.stderr.on('data', (chunk) => { stderr += chunk.toString() })
  return { proc, stderr: () => stderr }
}

async function openSession(port, logs) {
  const version = await waitJson(`http://127.0.0.1:${port}/json/version`)
  const browser = connect(version.webSocketDebuggerUrl, logs)
  await browser.send('Target.setDiscoverTargets', { discover: true })
  const targets = await browser.send('Target.getTargets')
  const worker = targets.targetInfos.find((target) => target.url.endsWith('/background.js'))
  return { browser, worker }
}

async function main() {
  const work = await mkdtemp(join(tmpdir(), 'pdf-ping-'))
  const profile = join(work, 'profile')
  const fixture = join(work, 'notes.pdf')
  const shot = join(work, 'wheel.png')
  const savedPath = join(work, 'saved.pdf')
  await fixturePdf(fixture)
  const port = 9333
  const logs = []
  let proc
  let browser
  let server
  let mode = 'extension'

  const baseArgs = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-dev-shm-usage',
    '--window-size=1280,900',
    '--remote-allow-origins=*',
  ]
  const launched = await launchChrome([
    ...baseArgs,
    '--disable-features=DisableLoadExtensionCommandLineSwitch',
    `--disable-extensions-except=${dist}`,
    `--load-extension=${dist}`,
  ])
  proc = launched.proc
  try {
    const session = await openSession(port, logs)
    browser = session.browser
    if (!session.worker) throw new Error('extension service worker missing')
    var extensionId = new URL(session.worker.url).host
  } catch (error) {
    console.warn('extension load failed, opening dist over http:', error.message)
    proc.kill('SIGKILL')
    browser?.close()
    await rm(profile, { recursive: true, force: true }).catch(() => {})
    mode = 'http'
    const served = await serve(dist)
    server = served.server
    const httpProfile = join(work, 'profile-http')
    const httpPort = port + 1
    const again = await launchChrome(baseArgs.map((arg) => arg.includes('remote-debugging-port') ? `--remote-debugging-port=${httpPort}` : arg.includes('user-data-dir') ? `--user-data-dir=${httpProfile}` : arg))
    proc = again.proc
    const session = await openSession(httpPort, logs)
    browser = session.browser
    extensionId = null
    var pageUrl = `http://127.0.0.1:${served.port}/viewer.html`
  }

  const pageUrlFinal = mode === 'extension' ? `chrome-extension://${extensionId}/viewer.html` : pageUrl
  let sessionId
  let targetId
  try {
    const created = await browser.send('Target.createTarget', { url: 'about:blank' })
    targetId = created.targetId
    const attached = await browser.send('Target.attachToTarget', { targetId, flatten: true })
    sessionId = attached.sessionId
    await browser.send('Page.enable', {}, sessionId)
    await browser.send('Runtime.enable', {}, sessionId)
    await browser.send('DOM.enable', {}, sessionId)
    await browser.send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 860,
      deviceScaleFactor: 1,
      mobile: false,
    }, sessionId)
    await browser.send('Target.activateTarget', { targetId })
    await browser.send('Page.navigate', { url: pageUrlFinal }, sessionId)
    await waitFor(browser, sessionId, "document.readyState === 'complete' && document.querySelector('#open')")

    const evalPage = (expression) => evaluate(browser, sessionId, expression)
    const { root } = await browser.send('DOM.getDocument', {}, sessionId)
    const found = await browser.send('DOM.querySelector', { nodeId: root.nodeId, selector: '#file' }, sessionId)
    await browser.send('DOM.setFileInputFiles', { files: [fixture], nodeId: found.nodeId }, sessionId)
    await waitFor(browser, sessionId, `(() => {
      const canvas = document.querySelector('canvas')
      if (!canvas || canvas.width < 10) return false
      const pixel = canvas.getContext('2d').getImageData(8, 8, 1, 1).data
      return pixel[0] < 90 && pixel[2] < 110
    })()`)

    const box = await evalPage(`(() => {
      const rect = document.querySelector('.page-wrap').getBoundingClientRect()
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    })()`)
    assert(box?.width > 200, 'page box missing')
    const tapX = box.x + box.width * 0.3
    const tapY = box.y + 250
    const wheelX = box.x + box.width * 0.7
    const wheelY = box.y + 270
    const pointer = { x: 0, y: 0 }

    await moveTo(browser, sessionId, pointer, tapX, tapY, 1)
    await keyTap(browser, sessionId, 'g', 'KeyG', 71)
    await waitFor(browser, sessionId, "document.querySelector('.stamp[data-type=\"caution\"]')")
    assert(await evalPage("document.querySelectorAll('.stamp').length") === 1, 'G shortcut did not place caution')

    await chord(browser, sessionId, 'z', 'KeyZ', 90, 2)
    await waitFor(browser, sessionId, "document.querySelectorAll('.stamp').length === 0")

    await moveTo(browser, sessionId, pointer, tapX, tapY, 1)
    await keyTap(browser, sessionId, 'g', 'KeyG', 71)
    await waitFor(browser, sessionId, "document.querySelector('.stamp[data-type=\"caution\"]')")

    await moveTo(browser, sessionId, pointer, wheelX, wheelY, 1)
    await keyDown(browser, sessionId, 'Alt', 'AltLeft', 18)
    await moveTo(browser, sessionId, pointer, wheelX, wheelY - 120, 8)
    await waitFor(browser, sessionId, "document.querySelector('#wheel:not([hidden]) .slice.is-hot')?.dataset.type === 'danger'")
    const image = await browser.send('Page.captureScreenshot', { format: 'png' }, sessionId)
    await writeFile(shot, Buffer.from(image.data, 'base64'))
    await keyUp(browser, sessionId, 'Alt', 'AltLeft', 18)
    await waitFor(browser, sessionId, "document.querySelector('.stamp[data-type=\"danger\"]')")
    assert(await evalPage("document.querySelectorAll('.stamp').length") === 2, 'wheel release did not stamp danger')

    await moveTo(browser, sessionId, pointer, tapX, tapY, 1)
    await keyTap(browser, sessionId, 't', 'KeyT', 84)
    await waitFor(browser, sessionId, "document.querySelector('.stamp[data-type=\"emote_thumb\"]')")
    assert(await evalPage("document.querySelectorAll('.stamp').length") === 3, 'T tap did not place center emote')

    const before = await evalPage("document.querySelector('.stamp[data-type=\"caution\"]').getBoundingClientRect().toJSON()")
    const originX = await evalPage("document.querySelector('.stamp[data-type=\"caution\"]').dataset.x")
    await moveTo(browser, sessionId, pointer, before.x + before.width / 2, before.y + before.height / 2, 1)
    await browser.send('Input.dispatchMouseEvent', {
      type: 'mousePressed', x: pointer.x, y: pointer.y, button: 'left', clickCount: 1,
    }, sessionId)
    await moveTo(browser, sessionId, pointer, pointer.x + 40, pointer.y + 28, 6)
    await browser.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased', x: pointer.x, y: pointer.y, button: 'left', clickCount: 1,
    }, sessionId)
    await new Promise((resolve) => setTimeout(resolve, 50))
    const afterX = await evalPage("document.querySelector('.stamp[data-type=\"caution\"]').dataset.x")
    assert(originX !== afterX, `drag did not move the caution ping (${originX} -> ${afterX})`)

    const danger = await evalPage("document.querySelector('.stamp[data-type=\"danger\"]').getBoundingClientRect().toJSON()")
    await moveTo(browser, sessionId, pointer, danger.x + danger.width / 2, danger.y + danger.height / 2, 1)
    await browser.send('Input.dispatchMouseEvent', {
      type: 'mousePressed', x: pointer.x, y: pointer.y, button: 'left', clickCount: 1,
    }, sessionId)
    await browser.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased', x: pointer.x, y: pointer.y, button: 'left', clickCount: 1,
    }, sessionId)
    await keyTap(browser, sessionId, 'Delete', 'Delete', 46)
    await waitFor(browser, sessionId, "document.querySelectorAll('.stamp').length === 2")
    await chord(browser, sessionId, 'z', 'KeyZ', 90, 2)
    await waitFor(browser, sessionId, "document.querySelectorAll('.stamp').length === 3")

    await moveTo(browser, sessionId, pointer, wheelX, wheelY, 1)
    await keyDown(browser, sessionId, 'Alt', 'AltLeft', 18)
    await new Promise((resolve) => setTimeout(resolve, 800))
    await keyUp(browser, sessionId, 'Alt', 'AltLeft', 18)
    await new Promise((resolve) => setTimeout(resolve, 80))
    assert(await evalPage("document.querySelectorAll('.stamp').length") === 3, 'dead-zone release should cancel')

    await evalPage(`(() => {
      const original = HTMLAnchorElement.prototype.click
      HTMLAnchorElement.prototype.click = function () {
        if (this.download) window.__download = { href: this.href, name: this.download }
        return original.call(this)
      }
    })()`)
    await evalPage("document.querySelector('#save').click()")
    await waitFor(browser, sessionId, "document.querySelector('#status').textContent.includes('已下载')")
    const bytes = await evalPage(`(async () => {
      const response = await fetch(window.__download.href)
      return Array.from(new Uint8Array(await response.arrayBuffer()))
    })()`)
    const saved = Buffer.from(bytes)
    await writeFile(savedPath, saved)
    const savedDoc = await PDFDocument.load(saved)
    const payload = readPingPayload(savedDoc)
    assert(payload.found && payload.pings.length === 3, `saved metadata has ${payload.pings?.length} stamps`)
    const types = payload.pings.map((ping) => ping.type).sort()
    assert(types.join() === 'caution,danger,emote_thumb', `unexpected types ${types}`)
    const nativeStamps = describePingAnnotations(savedDoc)
    assert(nativeStamps.length === 3, `saved PDF has ${nativeStamps.length} native Stamp annotations`)

    const docAgain = await browser.send('DOM.getDocument', {}, sessionId)
    const inputAgain = await browser.send('DOM.querySelector', { nodeId: docAgain.root.nodeId, selector: '#file' }, sessionId)
    await browser.send('DOM.setFileInputFiles', { files: [savedPath], nodeId: inputAgain.nodeId }, sessionId)
    await waitFor(browser, sessionId, "document.querySelectorAll('.stamp').length === 2 && !document.querySelector('#status').textContent.includes('正在')")
    const samples = await evalPage(`((colors) => {
      const canvas = document.querySelector('canvas')
      const context = canvas.getContext('2d')
      const canvasRect = canvas.getBoundingClientRect()
      const hits = []
      for (const el of document.querySelectorAll('.stamp')) {
        const rect = el.getBoundingClientRect()
        const cx = rect.left + rect.width / 2 - canvasRect.left
        const cy = rect.top + rect.height / 2 - canvasRect.top
        const scaleX = canvas.width / canvasRect.width
        const scaleY = canvas.height / canvasRect.height
        const radius = rect.width * 0.32
        let matched = null
        for (let step = 0; step < 8; step++) {
          const angle = (Math.PI * 2 * step) / 8
          const x = Math.round((cx + Math.cos(angle) * radius) * scaleX)
          const y = Math.round((cy + Math.sin(angle) * radius) * scaleY)
          const pixel = Array.from(context.getImageData(x, y, 1, 1).data)
          for (const [type, rgb] of Object.entries(colors)) {
            if (Math.abs(pixel[0] - rgb[0]) < 36 && Math.abs(pixel[1] - rgb[1]) < 36 && Math.abs(pixel[2] - rgb[2]) < 36 && pixel[3] > 200) matched = type
          }
        }
        hits.push({ type: el.dataset.type, matched })
      }
      return hits
    })(${JSON.stringify(COLORS)})`)
    for (const hit of samples) {
      assert(!hit.matched, `baked ${hit.matched} image still painted under ${hit.type}`)
    }

    await mkdir(mediaDir, { recursive: true })
    const mediaPath = join(mediaDir, 'ping-wheel.png')
    await writeFile(mediaPath, await readFile(shot))
    const shotStat = await readFile(mediaPath)
    assert(shotStat.length > 8000, 'screenshot looks empty')
    console.log(JSON.stringify({
      mode,
      bytes: saved.length,
      screenshot: mediaPath,
      screenshotBytes: shotStat.length,
      logs,
    }, null, 2))
  } catch (error) {
    const status = sessionId ? await evaluate(browser, sessionId, "({ status: document.querySelector('#status')?.textContent || '', href: location.href, title: document.title })").catch((evalError) => evalError.message) : 'no-session'
    console.error('page:', status)
    console.error('logs:', logs)
    console.error(error)
    throw error
  } finally {
    browser?.close()
    proc?.kill('SIGKILL')
    if (server) await new Promise((resolve) => server.close(resolve))
    await rm(work, { recursive: true, force: true }).catch((cleanupError) => {
      console.warn('cleanup', cleanupError.message)
    })
  }
}

async function evaluate(browser, sessionId, expression) {
  const result = await browser.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  }, sessionId)
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || result.exceptionDetails.exception?.description || 'evaluate failed')
  }
  return result.result?.value
}

async function waitFor(browser, sessionId, expression) {
  const start = Date.now()
  while (Date.now() - start < 20000) {
    try {
      if (await evaluate(browser, sessionId, `Boolean(${expression})`)) return
    } catch { /* page still loading */ }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  const status = await evaluate(browser, sessionId, "document.querySelector('#status')?.textContent || ''").catch(() => '')
  throw new Error(`timeout: ${expression} status=${status}`)
}

async function moveTo(browser, sessionId, pointer, x, y, steps) {
  for (let step = 1; step <= steps; step++) {
    const px = pointer.x + ((x - pointer.x) * step) / steps
    const py = pointer.y + ((y - pointer.y) * step) / steps
    await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: px, y: py }, sessionId)
  }
  pointer.x = x
  pointer.y = y
}

async function keyDown(browser, sessionId, key, code, vk, modifiers = 0) {
  await browser.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key,
    code,
    modifiers,
    windowsVirtualKeyCode: vk,
    nativeVirtualKeyCode: vk,
  }, sessionId)
}

async function keyUp(browser, sessionId, key, code, vk, modifiers = 0) {
  await browser.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key,
    code,
    modifiers,
    windowsVirtualKeyCode: vk,
    nativeVirtualKeyCode: vk,
  }, sessionId)
}

async function keyTap(browser, sessionId, key, code, vk) {
  await keyDown(browser, sessionId, key, code, vk)
  await keyUp(browser, sessionId, key, code, vk)
}

async function chord(browser, sessionId, key, code, vk, modifiers) {
  await keyDown(browser, sessionId, key, code, vk, modifiers)
  await keyUp(browser, sessionId, key, code, vk, modifiers)
}

await main()
