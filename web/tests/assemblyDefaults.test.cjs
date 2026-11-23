const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
function load(file, imports = {}) {
  const output = {}
  const source = fs.readFileSync(path.join(__dirname, '../lib/sync', file + '.ts'), 'utf8')
  new Function('exports', 'require', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText)(output, name => imports[name])
  return output
}
const presets = load('presets')
const { assemblySheetDefaults: defaults, assemblyAction } = load('assemblyDefaults', { './presets': presets })
const asset = id => ({ id, type: 'asset', kind: 'image', is_favorite: true })

test('keeps video assembly on for an empty sequence and off once scenes exist', () => {
  assert.equal(defaults(undefined, false, []).media.with_videos, true)
  assert.equal(defaults({ media: { with_videos: true } }, true, []).media.with_videos, false)
})
test('prepares both bars at 110px using the last favorite across projects', () => {
  const result = defaults({ overlay_bars: { favorite_asset_id: 'old', height_override: 0, position: 'top' } }, true, [asset('old'), asset('latest')], 'latest')
  assert.deepEqual(result.overlay_bars, { enabled: true, favorite_asset_id: 'latest', position: 'both', height_override: 110 })
})
test('ignores unavailable or unfavorited assets and keeps ordinary images out', () => {
  const result = defaults({ overlay_bars: { favorite_asset_id: 'valid' } }, true, [{ ...asset('stale'), is_favorite: false }, { ...asset('image'), type: 'image' }, asset('valid')], 'stale')
  assert.equal(result.overlay_bars.favorite_asset_id, 'valid')
  assert.equal(defaults(undefined, true, []).overlay_bars.enabled, false)
  assert.equal(defaults(undefined, true, []).overlay_bars.favorite_asset_id, null)
})

test('Apply joins audio only when enabled and otherwise routes to scenes or effects', () => {
  assert.equal(assemblyAction(presets.withDefaults()), 'scenes')
  const audio = presets.withDefaults({ media: { with_videos: false, with_images: false, with_audio: true } })
  assert.equal(assemblyAction(audio), 'scenes_with_audio')
  assert.equal(presets.withDefaults(audio).media.with_audio, true)
  assert.equal(assemblyAction(presets.withDefaults({ media: { with_videos: false, with_images: false, with_audio: false } })), 'effects')
  assert.equal(assemblyAction(presets.withDefaults({ media: { with_images: true, with_audio: true } })), 'scenes_with_audio')
})

test('opening assembly starts transition flow at 1:3 even when an older sequence saved 3:3',()=>{
 assert.equal(defaults({transition:{flow:3,enabled:true}},true,[]).transition.flow,1)
})
