import type {OverlayClip} from '@/types/project'
export interface TranscriptSegment{start:number;end:number;text:string}
export interface CaptionSource{assetId:string;start:number;duration:number;offset:number;rate:number}
export function captionCues(segments:TranscriptSegment[],source:CaptionSource,end:number){
 return segments.flatMap(segment=>{
 const words=segment.text.trim().split(/\s+/).filter(Boolean),cues:{start:number;duration:number;text:string}[]=[]
 if(segment.end<=segment.start||!words.length||source.rate<=0)return cues
 for(let i=0;i<words.length;i+=7){
 const from=segment.start+(segment.end-segment.start)*i/words.length,to=segment.start+(segment.end-segment.start)*Math.min(i+7,words.length)/words.length
 const start=Math.max(source.start,source.start+(from-source.offset)/source.rate),stop=Math.min(end,source.start+source.duration,source.start+(to-source.offset)/source.rate)
 if(stop>start)cues.push({start,duration:stop-start,text:words.slice(i,i+7).join(' ')})
 }return cues
 })
}
export function captionOverlay(cue:{start:number;duration:number;text:string}):OverlayClip{
 return {id:crypto.randomUUID(),auto_caption:true,asset_id:'',kind:'text',start:cue.start,duration:cue.duration,text_content:cue.text,x:0,y:-0.6,scale:1,opacity:1,speed:1,volume:0,text_style:{font_family:'Arial',font_size:48,font_weight:'bold',color:'#FFFFFF',alignment:'center',background_color:'#000000',background_opacity:0.65}}
}
