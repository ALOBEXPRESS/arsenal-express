const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const moduleExports = {}
const source = fs.readFileSync(require('node:path').join(__dirname, '../lib/editor/sceneEdits.ts'), 'utf8')
new Function('exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText)(moduleExports)
const { buildScenePropertyEdits: build, mergeScenePropertyEdits: merge } = moduleExports
const scenes = () => Array.from({ length: 10 }, (_, i) => ({ id: String(i), audio_duration: 8, metadata: { speed: i === 9 ? 1.05 : 1, trim: i / 10, volume: i / 10 } }))
const apply = (items, edits, direction) => items.map(scene => ({ ...scene, ...(edits.find(edit => edit.id === scene.id)?.[direction] || {}) }))

test('applies speed to every selected scene while preserving individual trims and volumes', () => {
  const original = scenes()
  const edits = build(original, original.map(scene => scene.id), { metadata: { speed: 1.05 } })
  const changed = apply(original, edits, 'after')
  assert(changed.every(scene => scene.metadata.speed === 1.05))
  assert.deepEqual(changed.map(scene => [scene.audio_duration, scene.metadata.trim, scene.metadata.volume]), original.map(scene => [scene.audio_duration, scene.metadata.trim, scene.metadata.volume]))
})

test('undo and redo restore the entire gesture, including initially mixed speeds', () => {
  const original = scenes()
  const ids = original.map(scene => scene.id)
  const first = build(original, ids, { metadata: { speed: 1.05 } })
  const intermediate = apply(original, first, 'after')
  const last = build(intermediate, ids, { metadata: { speed: 1.5 } })
  const gesture = merge(first, last)
  assert.equal(gesture.length, 10)
  const final = apply(intermediate, last, 'after')
  assert.deepEqual(apply(final, gesture, 'before'), original)
  assert.deepEqual(apply(original, gesture, 'after'), final)
})

test('partial selection and reset affect only selected scenes', () => {
  const original = scenes()
  const edits = build(original, ['2', '4'], { metadata: { speed: null } })
  assert.deepEqual(edits.map(edit => edit.id), ['2', '4'])
  const changed = apply(original, edits, 'after')
  assert.equal(changed[2].metadata.speed, null)
  assert.equal(changed[4].metadata.speed, null)
  assert.deepEqual(changed[9], original[9])
})
