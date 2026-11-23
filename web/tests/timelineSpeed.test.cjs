const {test}=require('node:test'),assert=require('node:assert/strict'),ts=require('typescript'),fs=require('node:fs')
const api={};new Function('exports',ts.transpileModule(fs.readFileSync(require('node:path').join(__dirname,'../lib/timeline.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(api)
const asset={id:'v',duration:8}
const scene=(metadata={},duration=8)=>({id:'s',video_asset_id:'v',audio_duration:duration,metadata})
test('accelerated scenes end with source and next scene begins immediately',()=>{const t=api.buildTimeline([scene({speed:1.2}),scene({speed:1.2})],[asset]);assert.equal(t[0].duration,8/1.2);assert.equal(t[1].start,8/1.2);assert.equal(t[0].duration*t[0].rate,8)})
test('source trim and trim_end constrain accelerated scene duration',()=>{const [t]=api.buildTimeline([scene({speed:2,trim:1,trim_end:7})],[asset]);assert.equal(t.duration,3);assert.equal(t.trim+t.duration*t.rate,7)})
test('shorter manual cuts remain intact; automatic timing stays unchanged',()=>{assert.equal(api.buildTimeline([scene({speed:1.2},2)],[asset])[0].duration,2);assert.equal(api.buildTimeline([scene({},10)],[asset])[0].duration,10)})
