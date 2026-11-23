const {test}=require('node:test'),assert=require('node:assert/strict'),ts=require('typescript'),fs=require('node:fs')
const api={};new Function('exports',ts.transpileModule(fs.readFileSync(require('node:path').join(__dirname,'../lib/narrationMix.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(api)
test('lowering narration restores scene audio only during that segment',()=>{const n=[{start:3,duration:2,volume:0},{start:5,duration:2,volume:1}];assert.equal(api.sceneMixVolume(3,0,undefined,n),1);assert.equal(api.sceneMixVolume(5,0,undefined,n),0.125);assert.equal(api.sceneMixVolume(7,0,undefined,n),1);assert.equal(api.sceneMixVolume(5,0,0,n),0)})
test('speech mute intervals respect reduced narration volume',()=>{const i=[{start:0,end:10}];assert.equal(api.sceneMixVolume(2,0,1,[{start:0,duration:10,volume:0.5}],i),0.5);assert.equal(api.sceneMixVolume(2,0,1,[{start:0,duration:10,volume:0}],i),1)})

test('restores automatically muted scene audio when narration is muted',()=>{assert.equal(api.sceneMixVolume(2,0,0,[{start:0,duration:5,volume:0}]),1)})

test('offline gain events mute speech at floating-point start boundaries and restore ambience at the end',()=>{
 const start=9.178571428571429, range={start:0.4447619047619045,end:2.433333333333333}
 const voice=[{start:0,duration:78,volume:1}]
 assert.ok((start+range.start)-start<range.start)
 assert.equal(api.sceneMixVolume(start+range.start,start,1,voice,[range]),0)
 assert.equal(api.sceneMixVolume(start+range.end,start,1,voice,[range]),1)
 assert.equal(api.sceneMixVolume(start+range.start-0.01,start,1,voice,[range]),1)
 assert.equal(api.sceneMixVolume(start+range.end-0.01,start,1,voice,[range]),0)
})
