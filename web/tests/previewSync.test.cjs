const {test}=require('node:test'),assert=require('node:assert/strict'),ts=require('typescript'),fs=require('node:fs')
const source=fs.readFileSync(require('node:path').join(__dirname,'../components/preview/VideoPreview.tsx'),'utf8')
const start=source.indexOf('function syncMedia('),end=source.indexOf('\n}',start)+2
const code=ts.transpileModule(source.slice(start,end),{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText
const sync=new Function('safePlay','HARD_SEEK',code+';return syncMedia')(el=>{el.paused=false},Number(source.match(/const HARD_SEEK = ([0-9.]+)/)[1]))
const media=()=>({currentTime:5,paused:false,seeking:false,readyState:3,playbackRate:1,pause(){this.paused=true}})
test('buffer hold pauses without rewinding an accelerated video',()=>{const el=media();el.playbackRate=1.2;for(let i=0;i<10;i++)sync(el,4.9,1.2,null,true);assert.equal(el.currentTime,5);assert.equal(el.paused,true)})
test('small drift at 1.2x and 2x does not trigger repeated seeks',()=>{for(const rate of [1.2,2]){const el=media();sync(el,5.12,rate,true,true);assert.equal(el.currentTime,5);assert.equal(el.playbackRate,rate)}})
test('in-flight seeks are not restarted; manual scrub still seeks',()=>{const el=media();el.seeking=true;sync(el,7,1.2,true,true);assert.equal(el.currentTime,5);el.seeking=false;sync(el,7,1.2,false,true);assert.equal(el.currentTime,7)})
