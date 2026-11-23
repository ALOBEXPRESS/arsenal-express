const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs'),ts=require('typescript')
const exportsObject={}
new Function('exports',ts.transpileModule(fs.readFileSync(require('node:path').join(__dirname,'../lib/sync/splitAudio.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(exportsObject)
const {splitAudioClip}=exportsObject
const clip={id:'left',asset_id:'music',start:4,duration:20,volume:0.7,speed:1.5,in_point:3}
test('audio split preserves source continuity, duration and settings at non-unit speed',()=>{
 const [left,right]=splitAudioClip(clip,12,'right')
 assert.equal(left.duration,8);assert.equal(right.duration,12);assert.equal(right.start,12)
 assert.equal(right.in_point,15);assert.equal(left.in_point+left.duration*left.speed,right.in_point)
 assert.equal(left.duration+right.duration,clip.duration)
 assert.equal(right.volume,clip.volume);assert.equal(right.asset_id,clip.asset_id);assert.equal(right.speed,clip.speed)
 assert.equal(clip.duration,20);assert.equal(clip.in_point,3)
 const [,tail]=splitAudioClip(right,16,'tail');assert.equal(tail.in_point,21)
})
test('rejects cuts outside or on the edges without making tiny pieces',()=>{
 for(const t of [0,4,4.01,23.99,24,30,NaN])assert.equal(splitAudioClip(clip,t,'right'),null)
})
test('untrimmed normal-speed audio starts the second part at elapsed source time',()=>{
 const [,right]=splitAudioClip({...clip,start:0,in_point:undefined,speed:1},7,'right')
 assert.equal(right.in_point,7)
})
