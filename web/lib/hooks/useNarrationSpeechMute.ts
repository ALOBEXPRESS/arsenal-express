'use client'
import {useEffect, useRef} from 'react'
import {useQueryClient} from '@tanstack/react-query'
import {toast} from 'sonner'
import {usePatchScene} from './useScenes'
import {transcribeAsset} from '@/lib/transcription'
import {downloadMedia} from '@/lib/storage/media'
import {decodeAudio} from '@/lib/sync/rhythm'
import {speechMuteRanges} from '@/lib/speechMute'
import type {TimedScene} from '@/lib/timeline'
import type {NarrationSegment, Scene} from '@/types/project'

export function useNarrationSpeechMute(projectId:string, subId:string, timeline:TimedScene[], narration:NarrationSegment[]) {
  const patch = usePatchScene(projectId), cache = useQueryClient()
  const live = useRef({timeline,narration}); live.current = {timeline,narration}
  const signature = JSON.stringify([projectId,subId,narration.map(n=>n.asset_id),timeline.map(t=>[t.scene.id,t.videoAsset?.id,t.trim,t.rate,t.duration])])
  useEffect(() => {
    if (!live.current.narration.length) return
    let cancelled = false
    const snapshot = live.current
    const run = async () => {
      const jobs = snapshot.timeline.filter(t=>t.videoAsset)
      const notice = toast.loading('Analisando falas para preservar o som ambiente…')
      try {
        let detect: ((buffer:AudioBuffer)=>Promise<{start:number;end:number}[]>) | undefined
        for (const item of jobs) {
          if (cancelled) return
          const marker = JSON.stringify([item.videoAsset!.id,item.trim,item.rate,item.duration,3])
          const current = () => cache.getQueryData<Scene[]>(['scenes',projectId])?.find(s=>s.id===item.scene.id)
          if (current()?.metadata?.speech_mute_analysis === marker) continue
          const transcript = await transcribeAsset(item.videoAsset!.id)
          if (cancelled) return
          if (!detect) {
            const {createSpeechIntervalDetector} = await import('@/lib/sync/speech')
            detect = await createSpeechIntervalDetector(true)
          }
          const detected = await detect(await decodeAudio(await downloadMedia(item.videoAsset!)))
          if (cancelled) return
          const scene = current()
          if (!scene) continue
          patch(scene.id,{metadata:{...scene.metadata, volume:1,
            voice_mute_intervals:speechMuteRanges(transcript.words,item.trim,item.rate,item.duration,detected),
            speech_mute_analysis:marker,
          }})
        }
        // Persist the narration transcript too; captions read the same server cache.
        for (const id of new Set(snapshot.narration.map(n=>n.asset_id))) {
          if (cancelled) return
          await transcribeAsset(id)
        }
        await patch.flush(true)
      } catch (error) {
        if (!cancelled) toast.error('Não foi possível concluir a análise das falas.',{description:error instanceof Error?error.message:undefined})
      } finally { toast.dismiss(notice) }
    }
    void run()
    return () => {cancelled=true}
  },[signature,cache,patch,projectId])
}
