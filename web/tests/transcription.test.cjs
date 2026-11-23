const {test}=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), ts=require('typescript'), path=require('node:path')
const api={}
new Function('exports',ts.transpileModule(fs.readFileSync(path.join(__dirname,'../lib/transcription.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(api)
test('captions and speech analysis share an in-flight request; failed requests can retry',async()=>{
  const original=global.fetch
  let calls=0, fail=false
  global.fetch=async()=>{calls++;return {ok:!fail,json:async()=>fail?{error:'API indisponível'}:{segments:[],words:[]}}}
  try {
    const first=api.transcribeAsset('audio')
    const second=api.transcribeAsset('audio')
    assert.equal(first,second)
    await Promise.all([first,second]);assert.equal(calls,1)
    fail=true
    await assert.rejects(api.transcribeAsset('audio'),/API indisponível/)
    fail=false
    await api.transcribeAsset('audio');assert.equal(calls,3)
  } finally {global.fetch=original}
})
