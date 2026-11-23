const {test}=require('node:test'),assert=require('node:assert/strict'),ts=require('typescript'),fs=require('node:fs')
const api={};new Function('exports',ts.transpileModule(fs.readFileSync(require('node:path').join(__dirname,'../lib/captions.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(api)
test('maps source transcription through trim and speed without captions outside the timeline',()=>{
 const cues=api.captionCues([{start:2,end:6,text:'Uma frase de teste'}],{assetId:'a',start:10,duration:3,offset:2,rate:2},12)
 assert.deepEqual(cues,[{start:10,duration:2,text:'Uma frase de teste'}])
 assert.deepEqual(api.captionCues([{start:0,end:1,text:'antes do corte'}],{assetId:'a',start:10,duration:3,offset:2,rate:2},20),[])
})
test('short caption phrases cover long speech and preserve all words',()=>{
 const text='um dois três quatro cinco seis sete oito nove dez onze doze treze quatorze quinze'
 const cues=api.captionCues([{start:0,end:15,text}],{assetId:'a',start:0,duration:15,offset:0,rate:1},15)
 assert.equal(cues.length,3);assert.equal(cues.map(c=>c.text).join(' '),text);assert.equal(cues[0].duration,7);assert.equal(cues[2].start+cues[2].duration,15)
})
test('caption overlays are editable text and marked for safe regeneration',()=>{
 const o=api.captionOverlay({start:3,duration:2,text:'Olá'});assert.equal(o.kind,'text');assert.equal(o.auto_caption,true);assert.equal(o.text_content,'Olá');assert.equal(o.start,3)
})
