const {test} = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const path = require('node:path')
const output = {}
new Function('exports', ts.transpileModule(fs.readFileSync(path.join(__dirname, '../lib/subprojects.ts'), 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020},
}).outputText)(output)
const {emptySub, getSubprojects, scenesOf, sequenceAssetIds, assetInSequence, assemblySequenceTargets} = output

test('normalization retains episode-specific settings and stable identifiers', () => {
  const sub = {...emptySub('episode-7', 0), source_settings: {output_format: '9:16', sync: {speed: {value: 1.2}}}}
  assert.deepEqual(getSubprojects({subprojects: [sub]})[0], sub)
  assert.equal(scenesOf([{id: 'scene', metadata: {sub: sub.id}, order_index: 5}], sub.id).length, 1)
})

test('library includes shared favorites and referenced media in a duplicated sequence, excluding other episodes', () => {
  const sub = {...emptySub('duplicate', 0), narration_track: [{asset_id: 'voice'}]}
  const references = sequenceAssetIds(sub, [{video_asset_id: 'video', image_asset_id: 'image'}])
  for (const id of ['voice', 'video', 'image']) {
    assert.equal(assetInSequence({id, metadata: {sequence_id: 'source'}}, sub.id, references), true)
  }
  assert.equal(assetInSequence({id: 'music', library_user_id: 'owner', metadata: {sequence_id: 'source'}}, sub.id, references), true)
  assert.equal(assetInSequence({id: 'unused', metadata: {sequence_id: 'other-episode'}}, sub.id, references), false)
  assert.equal(assetInSequence({id: 'new', metadata: {sequence_id: sub.id}}, sub.id, references), true)
  assert.equal(assetInSequence({id: 'legacy'}, sub.id, references), true)
})

test('splitting multiple narration files rebuilds only the active episode and creates new sequences', () => {
  const list = [emptySub('main', 0), emptySub('episode-2', 1), emptySub('episode-3', 2)]
  list[1].source_settings = {output_format: '9:16'}
  let next = 0
  const targets = assemblySequenceTargets(list, 'episode-2', 3, () => 'new-' + ++next)
  assert.deepEqual(targets.map(s => s.id), ['episode-2', 'new-1', 'new-2'])
  assert.equal(targets[1].name, 'Sequência 4')
  assert.deepEqual(targets[2].source_settings, {output_format: '9:16'})
  assert.deepEqual(list.map(s => s.id), ['main', 'episode-2', 'episode-3'])
})
