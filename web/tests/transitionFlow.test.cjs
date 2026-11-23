const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const output = {}
new Function('exports', ts.transpileModule(fs.readFileSync(path.join(__dirname, '../lib/sync/presets.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText)(output)
const { withDefaults, pickTransition } = output
const settings = flow => withDefaults({ transition: { enabled: true, mode: 'variado', selected: ['fusao', 'flash_preto', 'empurrar'], flow } })
const plan = flow => Array.from({ length: 10 }, (_, i) => pickTransition(settings(flow), i))

test('defaults transition flow to 1:3 and preserves an explicit choice', () => {
  assert.equal(withDefaults().transition.flow, 1)
  assert.equal(withDefaults({ transition: { flow: 2 } }).transition.flow, 2)
})
test('applies exactly the requested number of effects per three boundaries', () => {
  for (const flow of [1, 2, 3]) {
    const result = plan(flow)
    assert.equal(result[0], 'cut')
    for (let start = 1; start < 10; start += 3) assert.equal(result.slice(start, start + 3).filter(t => t !== 'cut').length, flow)
  }
})
test('switching 3:3 to 1:3 replaces old transitions with dry cuts', () => {
  const previous = plan(3)
  const next = plan(1)
  assert.equal(previous.slice(1).filter(t => t !== 'cut').length, 9)
  assert.equal(next.slice(1).filter(t => t !== 'cut').length, 3)
  assert.deepEqual(next, ['cut', 'cut', 'cut', 'fusao', 'cut', 'cut', 'flash_preto', 'cut', 'cut', 'empurrar'])
})
