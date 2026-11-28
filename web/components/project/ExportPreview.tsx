'use client'
import {useEffect,useRef,useState} from 'react'
import {createExportPreview,type RenderInput} from '@/lib/render/mp4'
import {formatTime} from '@/lib/timeline'

export function ExportPreview({input,width,height,resultUrl}:{input:RenderInput;width:number;height:number;resultUrl:string|null}) {
 const canvas=useRef<HTMLCanvasElement>(null)
 const [time,setTime]=useState(0),[busy,setBusy]=useState(true),[error,setError]=useState('')
 const renderer=useRef<ReturnType<typeof createExportPreview>|null>(null)
 const queue=useRef<Promise<void>>(Promise.resolve())
 useEffect(()=>{
   const engine=createExportPreview();renderer.current=engine
   return ()=>{renderer.current=null;void queue.current.finally(()=>engine.dispose())}
 },[])
 useEffect(()=>{
   if(resultUrl)return
   const controller=new AbortController(),engine=renderer.current,target=canvas.current
   if(!engine||!target)return
   setBusy(true);setError('')
   queue.current=queue.current.catch(()=>{}).then(async()=>{
     if(controller.signal.aborted)return
     try {await engine.draw(input,target,Math.min(time,Math.max(0,input.duration-0.001)),width,height,controller.signal)}
     catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Não foi possível carregar a prévia.')}
     finally{if(!controller.signal.aborted)setBusy(false)}
   })
   return ()=>controller.abort()
 },[input,width,height,time,resultUrl])
 return <section className="space-y-3 rounded-xl border border-border bg-surface-0 p-4" aria-label="Prévia da exportação">
   <div className="flex items-center justify-between text-sm"><h3 className="font-semibold">{resultUrl?'Vídeo final':'Prévia do enquadramento'}</h3><span className="font-mono text-xs text-muted-foreground">{width===height?'1:1':width<height?'9:16':'16:9'} · {width}×{height}</span></div>
   <div className="flex min-h-36 items-center justify-center rounded-lg bg-black p-2">
     {resultUrl?<video key={resultUrl} src={resultUrl} controls playsInline preload="metadata" aria-label="Reproduzir vídeo final" className="max-h-[45vh] max-w-full" style={{aspectRatio:`${width}/${height}`}}/>
      :<canvas ref={canvas} aria-label="Enquadramento final com cenas e overlays" className="max-h-[45vh] max-w-full" style={{aspectRatio:`${width}/${height}`,width:width<height?'auto':'100%',height:width<height?'40vh':'auto'}}/>}
   </div>
   {!resultUrl&&<><label className="flex items-center gap-3 text-xs text-muted-foreground">Ver trecho<input aria-label="Posição da prévia de exportação" className="min-w-0 flex-1 accent-primary" type="range" min={0} max={Math.max(0,input.duration-0.001)} step={0.1} value={Math.min(time,input.duration)} onChange={e=>setTime(Number(e.target.value))}/><span>{formatTime(time)}</span></label><p className="text-xs text-muted-foreground" role="status">{error|| (busy?'Carregando prévia…':'Arraste para conferir os trechos. Após renderizar, reproduza o MP4 final aqui.')}</p></>}
 </section>
}
