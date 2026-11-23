const {test}=require('node:test'),assert=require('node:assert/strict'),ts=require('typescript'),fs=require('node:fs')
const source=fs.readFileSync(require('node:path').join(__dirname,'../lib/sync/visual.ts'),'utf8')
const start=source.indexOf('export function poseToTransform('),end=source.indexOf('\n}',start)+2,api={}
new Function('exports',ts.transpileModule(source.slice(start,end),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(api)
test('zoom and X at zero or undefined Y always produce valid three-argument translate3d',()=>{for(const y of [undefined,0]){const value=api.poseToTransform({scale:1.35,x:-0.09,y});assert.equal(value,'translate3d(-4.500%, 0.000%, 0) scale(1.3500)')}})
test('Y and rotation preserve all transform components',()=>{assert.equal(api.poseToTransform({scale:1,x:0,y:-0.1,rotation:22}),'translate3d(0.000%, -5.000%, 0) scale(1.0000) rotate(22deg)')})
