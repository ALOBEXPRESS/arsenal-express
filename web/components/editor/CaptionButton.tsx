"use client"
import {useState,useRef,useEffect} from 'react'
import {Button} from '@/components/ui/button'
import {toast} from 'sonner'
import {confirmDialog} from '@/components/ui/confirm'
import {captionCues,captionOverlay,type TranscriptSegment,type CaptionSource} from '@/lib/captions'
import type {TimedScene} from '@/lib/timeline'
import type {Tracks} from '@/lib/hooks/useTracks'
export function CaptionButton({tracks,timeline}:{tracks:Tracks;timeline:TimedScene[]}){
 const [busy,setBusy]=useState(false),[progress,setProgress]=useState('')
 const running=useRef(false)
 const live=useRef(true);useEffect(()=>{live.current=true;return()=>{live.current=false}},[])
 const signature=JSON.stringify({timeline:timeline.map(t=>[t.scene.id,t.start,t.duration,t.trim,t.rate]),narration:tracks.narrationTrack})
 const current=useRef(signature);current.current=signature
 const generate=async()=>{
 const snapshot=current.current
 const end=timeline.reduce((m,t)=>Math.max(m,t.start+t.duration),0)
 if(!end){toast.error('Adicione cenas antes de gerar legendas.');return}
 const narration=tracks.narrationTrack
 const sources:CaptionSource[]=narration.length?narration.map(n=>({assetId:n.asset_id,start:n.start,duration:n.duration,offset:n.in_point||0,rate:n.speed||1})):timeline.filter(t=>t.videoAsset).map(t=>({assetId:t.videoAsset!.id,start:t.start,duration:t.duration,offset:t.trim,rate:t.rate}))
 if(!sources.length){toast.error('Adicione uma narração ou vídeos com áudio.');return}
 if(tracks.overlays.some(o=>o.auto_caption)&&!await confirmDialog({title:'Gerar legendas novamente?',description:'Substitui apenas as legendas automáticas desta sequência. Textos e barras existentes serão preservados.',confirmLabel:'Gerar legendas'}))return
 setBusy(true)
 try{
 const cache=new Map<string,TranscriptSegment[]>(),captions=[]
 for(const source of sources){
 if(!live.current)return
 if(!cache.has(source.assetId)){
 setProgress(`Transcrevendo ${cache.size+1}/${new Set(sources.map(s=>s.assetId)).size}`)
 const response=await fetch('/api/captions/transcribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({assetId:source.assetId})})
 const data=await response.json();if(!response.ok)throw Error(data.error||'Falha ao transcrever.');cache.set(source.assetId,data.segments)
 }
 for(const cue of captionCues(cache.get(source.assetId)!,source,end)){
 // Split at scene boundaries so every scene has independently editable captions.
 for(const scene of timeline){const start=Math.max(cue.start,scene.start),stop=Math.min(cue.start+cue.duration,scene.start+scene.duration);if(stop>start)captions.push(captionOverlay({...cue,start,duration:stop-start}))}
 }
 }
 if(!live.current)return
 if(!captions.length)throw Error('Nenhuma fala encontrada nos trechos da sequência.')
 if(current.current!==snapshot)throw Error('A timeline mudou durante a geração. Tente novamente para sincronizar os novos cortes.')
 await tracks.saveAutomaticCaptions(captions);toast.success(`${captions.length} legendas adicionadas. Edite os textos na timeline.`)
 }catch(e){toast.error(e instanceof Error?e.message:'Falha ao gerar legendas.')}finally{if(live.current){setBusy(false);setProgress('')}}
 }
 const download=()=>{
 const cues=tracks.overlays.filter(o=>o.auto_caption).sort((a,b)=>a.start-b.start)
 const stamp=(t:number)=>{const ms=Math.round(t*1000);return `${String(Math.floor(ms/3600000)).padStart(2,'0')}:${String(Math.floor(ms/60000)%60).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')},${String(ms%1000).padStart(3,'0')}`}
 const url=URL.createObjectURL(new Blob([cues.map((o,i)=>`${i+1}\n${stamp(o.start)} --> ${stamp(o.start+o.duration)}\n${o.text_content}`).join('\n\n')],{type:'text/plain;charset=utf-8'}))
 const a=document.createElement('a');a.href=url;a.download='legendas.srt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
 }
 return <><Button variant="outline" size="sm" disabled={busy} onClick={()=>{if(!running.current){running.current=true;void generate().finally(()=>{running.current=false})}}}>{busy?progress||'Gerando…':'Legendar cenas'}</Button>{tracks.overlays.some(o=>o.auto_caption)&&<Button variant="ghost" size="sm" onClick={download}>Baixar SRT</Button>}</>
}
