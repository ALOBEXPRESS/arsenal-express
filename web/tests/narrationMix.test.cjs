const {test}=require('node:test'),assert=require('node:assert/strict'),ts=require('typescript'),fs=require('node:fs')
const api={};new Function('exports',ts.transpileModule(fs.readFileSync(require('node:path').join(__dirname,'../lib/narrationMix.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(api)
test('lowering narration restores scene audio only during that segment',()=>{const n=[{start:3,duration:2,volume:0},{start:5,duration:2,volume:1}];assert.equal(api.sceneMixVolume(3,0,undefined,n),1);assert.equal(api.sceneMixVolume(5,0,undefined,n),0.125);assert.equal(api.sceneMixVolume(7,0,undefined,n),1);assert.equal(api.sceneMixVolume(5,0,0,n),0)})
test('speech mute intervals respect reduced narration volume',()=>{const i=[{start:0,end:10}];assert.equal(api.sceneMixVolume(2,0,1,[{start:0,duration:10,volume:0.5}],i),0.5);assert.equal(api.sceneMixVolume(2,0,1,[{start:0,duration:10,volume:0}],i),1)})

test('restores automatically muted scene audio when narration is muted',()=>{assert.equal(api.sceneMixVolume(2,0,0,[{start:0,duration:5,volume:0}]),1)})
