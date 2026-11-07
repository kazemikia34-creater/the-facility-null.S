import { createRequire } from 'node:module'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const runtime = join(process.env.HOME || '/home/runner', '.local/share/omgithub-playwright')
const require = createRequire(join(runtime, 'package.json'))
const { chromium } = require('playwright')
const config = JSON.parse(readFileSync(join(runtime, process.platform === 'darwin' ? 'metal.json' : 'linux.json'), 'utf8'))
const url = process.env.CAPTURE_URL
const output = process.env.CAPTURE_DIR

if (!url || !output) throw new Error('Set CAPTURE_URL and CAPTURE_DIR.')
const parsedURL = new URL(url)
if (!['http:', 'https:'].includes(parsedURL.protocol)) throw new Error('CAPTURE_URL must use HTTP or HTTPS.')
mkdirSync(output, { recursive: true })
if (process.platform === 'linux' && !process.env.DISPLAY) {
  const displayFile = join(runtime, 'display')
  if (existsSync(displayFile)) process.env.DISPLAY = `:${readFileSync(displayFile, 'utf8').trim()}`
}

const transient = error => Object.assign(error, { exitCode: 75 })
const transientStatus = status => !status || [408, 429, 500, 502, 503, 504].includes(status)
let browser
let exitCode = 0
const defects = []
try {
  browser = await chromium.launch({ ...config.browser.launchOptions, timeout: 30000 }).catch(error => { throw transient(error) })
  for (const [name, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844]]) {
    const context = await browser.newContext({ viewport: { width, height } }).catch(error => { throw transient(error) })
    try {
      const page = await context.newPage().catch(error => { throw transient(error) })
      page.setDefaultTimeout(20000)
      page.on('pageerror', error => defects.push(`${name}: ${error.message}`))
      page.on('response', response => {
        try {
          if (response.status() >= 400 && new URL(response.url()).origin === parsedURL.origin) {
            defects.push(`${name}: HTTP ${response.status()} ${response.url()}`)
          }
        } catch {}
      })

      const response = await page.goto(url, { waitUntil: 'load', timeout: 45000 }).catch(error => { throw transient(error) })
      if (!response?.ok()) {
        const status = response?.status()
        const error = new Error(`HTTP ${status ?? 'no response'} loading ${url}`)
        error.exitCode = transientStatus(status) ? 75 : 1
        throw error
      }

      const rendered = await page.waitForFunction(() => {
        const menu = document.querySelector('#main-menu')
        const title = menu?.querySelector('h1')
        const canvas = document.querySelector('#game')
        if (!menu || !title?.textContent?.trim() || !canvas || canvas.width === 0 || canvas.height === 0) return false
        const style = getComputedStyle(menu)
        const rect = menu.getBoundingClientRect()
        return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0
      }, null, { timeout: 45000 }).catch(() => null)
      if (!rendered) throw new Error(`${name}: expected visible title menu and rendered game canvas did not appear.`)
      await page.evaluate(() => Promise.race([
        document.fonts.ready.then(() => true),
        new Promise(resolve => setTimeout(() => resolve(false), 4000))
      ]))
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))

      // CDP capture avoids Chromium's screenshot-time font wait, which can hang
      // despite the page being rendered and its font requests having completed.
      const session = await context.newCDPSession(page).catch(error => { throw transient(error) })
      try {
        const { data } = await session.send('Page.captureScreenshot', {
          format: 'png',
          fromSurface: true,
          captureBeyondViewport: false
        }).catch(error => { throw transient(error) })
        const file = join(output, `final-${name}.png`)
        const image = Buffer.from(data, 'base64')
        if (image.length < 1000 || image.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
          throw new Error(`${name}: browser returned an empty or invalid PNG.`)
        }
        writeFileSync(file, image)
        console.log(`Captured ${name} ${width}x${height}: ${file} (${image.length} bytes)`)
      } finally {
        await session.detach().catch(() => {})
      }
    } finally {
      await context.close().catch(error => { throw transient(error) })
    }
  }
  if (defects.length) throw new Error(`Preview rendering defects: ${defects.join('; ')}`)
} catch (error) {
  console.error(error)
  exitCode = error.exitCode || 1
} finally {
  if (browser) {
    await browser.close().catch(error => {
      console.error(`Could not close capture browser: ${error.message}`)
      if (!exitCode) exitCode = 75
    })
  }
}
process.exitCode = exitCode
