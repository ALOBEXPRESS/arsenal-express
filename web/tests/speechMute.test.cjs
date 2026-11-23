const {test}=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), ts=require('typescript'), path=require('node:path')
const api={}
new Function('exports',ts.transpileModule(fs.readFileSync(path.join(__dirname,'../lib/speechMute.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(api)
test('word masking retains breathing gaps and maps source trim and playback speed',()=>{
  const ranges=api.speechMuteRanges([{start:2,end:3},{start:4,end:5},{start:0,end:1}],2,2,2)
  assert.deepEqual(ranges,[{start:0,end:0.58},{start:0.94,end:1.58}])
  assert.ok(ranges[1].start-ranges[0].end>0.3)
})
test('no speech keeps ambience, overlaps merge, and boundaries stay inside scene',()=>{
  assert.deepEqual(api.speechMuteRanges([],0,1,4),[])
  assert.deepEqual(api.speechMuteRanges([{start:0,end:2},{start:1,end:5}],0,1,3),[{start:0,end:3}])
})

test('acoustic detection covers speech missing from Whisper while longer breaths stay open',()=>{
 const ranges=api.speechMuteRanges([{start:1,end:1.2}],0,1,5,[{start:0.8,end:1.5},{start:3,end:3.5}])
 assert.deepEqual(ranges,[{start:0.74,end:1.58},{start:2.94,end:3.58}])
})

test('does not mute ambience for hallucinated words when no acoustic speech exists',()=>{
 assert.deepEqual(api.speechMuteRanges([{start:1,end:3}],0,1,5,[]),[])
})
