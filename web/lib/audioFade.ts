export function audioFade(duration: number, fadeIn = 0, fadeOut = 0) {
 const a=Math.max(0,Math.min(duration,fadeIn)),b=Math.max(0,Math.min(duration,fadeOut))
 const scale=a+b>duration?duration/(a+b):1
 return {fadeIn:a*scale,fadeOut:b*scale}
}
export function audioFadeGain(time:number,duration:number,fadeIn=0,fadeOut=0){
 const f=audioFade(duration,fadeIn,fadeOut)
 return Math.max(0,Math.min(1,f.fadeIn?time/f.fadeIn:1,f.fadeOut?(duration-time)/f.fadeOut:1))
}
