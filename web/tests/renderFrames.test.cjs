const {test}=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), ts=require('typescript'), path=require('node:path')
const source=fs.readFileSync(path.join(__dirname,'../lib/render/mp4.ts'),'utf8')
const start=source.indexOf('async function decodedFrame('),end=source.indexOf('\n}',start)+2
const compiled=ts.transpileModule(source.slice(start,end),{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText
test('export waits for decoded frame instead of capturing an old image on a timer',async()=>{
 const frames=new WeakMap(), video={duration:5}, canvas={frame:12}
 let release,settled=false
 frames.set(video,{frames:{next:()=>new Promise(resolve=>{release=()=>resolve({value:{canvas}})})}})
 const decode=new Function('videoFrames',compiled+';return decodedFrame')(frames)
 const pending=decode(video,1).then(result=>{settled=true;return result})
 await Promise.resolve();assert.equal(settled,false)
 release();assert.equal(await pending,canvas)
})
test('missing decoder or missing decoded frame fails export instead of silently freezing',async()=>{
 const frames=new WeakMap(),video={duration:5}
 const decode=new Function('videoFrames',compiled+';return decodedFrame')(frames)
 await assert.rejects(decode(video,1),/Decodificador/)
 frames.set(video,{frames:{next:async()=>({value:null})}})
 await assert.rejects(decode(video,1),/decodificar o quadro/)
})
