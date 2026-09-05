/**
 * Parse every Mermaid source under a directory, or every ```mermaid block in a
 * Markdown file, and fail on the first syntax error.
 *
 *   node scripts/validate-diagrams.mjs docs/diagrams/architecture
 *   node scripts/validate-diagrams.mjs docs/ARCHITECTURE.md
 *
 * Mermaid needs a DOM even to parse, so jsdom stands in for the browser.
 * Requires: npm i --no-save mermaid jsdom
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body></body></html>')
global.window = dom.window
global.document = dom.window.document
global.navigator = dom.window.navigator
global.Element = dom.window.Element
global.HTMLElement = dom.window.HTMLElement
global.SVGElement = dom.window.SVGElement

const { default: mermaid } = await import('mermaid/dist/mermaid.core.mjs')
mermaid.initialize({ startOnLoad: false, securityLevel: 'loose' })

const target = process.argv[2] ?? 'docs/diagrams/architecture'
const blocks = statSync(target).isDirectory()
  ? readdirSync(target)
      .filter((f) => f.endsWith('.mmd'))
      .sort()
      .map((f) => [f, readFileSync(path.join(target, f), 'utf8')])
  : [...readFileSync(target, 'utf8').matchAll(/^```mermaid\n([\s\S]*?)^```$/gm)]
      .map((m, i) => [`${path.basename(target)} block ${i + 1}`, m[1]])

let failed = 0
for (const [name, source] of blocks) {
  try {
    await mermaid.parse(source)
    console.log('PASS', name)
  } catch (error) {
    failed++
    console.error('FAIL', name, '\n    ' + String(error?.message ?? error).split('\n').slice(0, 8).join('\n    '))
  }
}
console.log(failed ? `\n${failed} of ${blocks.length} failed` : `\nall ${blocks.length} diagrams valid`)
process.exit(failed ? 1 : 0)
