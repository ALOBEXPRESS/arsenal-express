const {test}=require('node:test'),assert=require('node:assert/strict'),ts=require('typescript'),fs=require('node:fs')
const source=fs.readFileSync(require('node:path').join(__dirname,'../lib/render/mp4.ts'),'utf8')
const start=source.indexOf('function calculateTransform('),end=source.indexOf('\n}',start)+2
const code=ts.transpileModule(source.slice(start,end),{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText
const transform=new Function(code+';return calculateTransform')()
const scene={duration:8,scene:{animation_type:'none',metadata:{}}}
test('720p and 1080p portrait clips produce identical centered output without stretching',()=>{
 for(const [w,h] of [[720,1280],[1080,1920]]){const t=transform(scene,0,1080,1920,w,h);assert.equal(t.width*t.scale,1080);assert.equal(t.height*t.scale,1920);assert.equal(t.x,0);assert.equal(t.y,0)}
})
test('landscape media keeps its own aspect ratio when filling a portrait output',()=>{const t=transform(scene,0,1080,1920,1920,1080);assert.equal(t.width/t.height,16/9);assert.equal(t.height*t.scale,1920);assert(t.x<0)})
