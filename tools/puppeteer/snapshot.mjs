#!/usr/bin/env node
/**
 * Puppeteer browser CLI for Claude Code.
 *
 * Usage:
 *   snapshot <url>                         screenshot → /tmp/puppeteer-<ts>.png, prints path
 *   snapshot <url> --full-page             full-page screenshot
 *   snapshot <url> --output /path/out.png  custom output path
 *   snapshot <url> --content               print page text to stdout
 *   snapshot <url> --content --html        print full HTML to stdout
 *   snapshot <url> --eval "document.title" evaluate JS, print result
 *   snapshot <url> --click "#selector"     click element then screenshot
 *   snapshot <url> --wait "#selector"      wait for selector then screenshot
 */

import puppeteer from 'puppeteer'
import { writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const args = process.argv.slice(2)

function flag(name) {
  const i = args.indexOf(name)
  return i !== -1
}

function option(name) {
  const i = args.indexOf(name)
  return i !== -1 && i + 1 < args.length ? args[i + 1] : null
}

const url = args.find(a => !a.startsWith('--') && args.indexOf(a) === args.findIndex(x => x === a))
const doContent = flag('--content')
const doHtml = flag('--html')
const doFullPage = flag('--full-page')
const evalScript = option('--eval')
const clickSelector = option('--click')
const waitSelector = option('--wait')
const outputPath = option('--output') ?? join(tmpdir(), `puppeteer-${Date.now()}.png`)

if (!url) {
  console.error('Usage: snapshot <url> [--content] [--html] [--full-page] [--output <path>] [--eval "<js>"] [--click "<selector>"] [--wait "<selector>"]')
  process.exit(1)
}

let browser
try {
  browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  })

  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 800 })
  await page.setUserAgent(
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  )

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })

  if (waitSelector) {
    await page.waitForSelector(waitSelector, { timeout: 10_000 })
  }

  if (clickSelector) {
    await page.click(clickSelector, { timeout: 10_000 })
    // brief settle after click
    await new Promise(r => setTimeout(r, 500))
  }

  if (evalScript) {
    const result = await page.evaluate(evalScript)
    console.log(typeof result === 'string' ? result : JSON.stringify(result, null, 2))
  } else if (doContent) {
    if (doHtml) {
      console.log(await page.content())
    } else {
      const text = await page.evaluate(() => document.body?.innerText ?? document.documentElement.innerText ?? '')
      console.log(text)
    }
  } else {
    const buf = await page.screenshot({ fullPage: doFullPage, type: 'png' })
    writeFileSync(outputPath, buf)
    const title = await page.title()
    // Print path so Claude can Read the image
    console.log(outputPath)
    // Extra context on stderr so it doesn't pollute path-only stdout
    process.stderr.write(`Title: ${title}  |  ${buf.length} bytes\n`)
  }
} finally {
  await browser?.close()
}
