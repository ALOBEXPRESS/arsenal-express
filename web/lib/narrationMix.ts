export function sceneMixVolume(time:number, sceneStart:number, volume:number|undefined, narration:{start:number;duration:number;volume?:number}[], intervals?:{start:number;end:number}[]) {
 const epsilon=1e-7 // Absolute/local time conversion must agree at scheduled gain boundaries.
 const ceiling=Math.max(0,Math.min(1,volume??1))
 const segment=narration.find(n=>time>=n.start-epsilon && time<n.start+n.duration-epsilon)
 if(!segment)return ceiling
 const voice=Math.max(0,Math.min(1,segment.volume??1))
 const duck=intervals ? (intervals.some(v=>time-sceneStart>=v.start-epsilon && time-sceneStart<v.end-epsilon)?0:1) : 0.125
 return ceiling*duck*voice + (volume === 0 ? 1 : ceiling)*(1-voice)
}
