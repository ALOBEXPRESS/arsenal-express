'use client'

import { useState, useEffect, useRef } from 'react'
import type { Scene, Asset } from '@/types/project'

interface VideoPreviewProps {
  scenes: Scene[]
  assets: Asset[]
  currentTime?: number
  onTimeUpdate?: (time: number) => void
}

export function VideoPreview({
  scenes,
  assets,
  currentTime = 0,
  onTimeUpdate,
}: VideoPreviewProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0)
  const [sceneTime, setSceneTime] = useState(0)
  const videoRef = useRef<HTMLVideoElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)

  const currentScene = scenes[currentSceneIndex]

  // Find assets for current scene
  const videoAsset = assets.find((a) => a.id === currentScene?.video_asset_id)
  const imageAsset = assets.find((a) => a.id === currentScene?.image_asset_id)
  const audioAsset = assets.find((a) => a.id === currentScene?.audio_asset_id)

  // Calculate total duration
  const totalDuration = scenes.reduce((sum, scene) => sum + scene.duration, 0)

  useEffect(() => {
    // Update current scene based on time
    let accumulatedTime = 0
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i]
      if (currentTime >= accumulatedTime && currentTime < accumulatedTime + scene.duration) {
        setCurrentSceneIndex(i)
        setSceneTime(currentTime - accumulatedTime)
        break
      }
      accumulatedTime += scene.duration
    }
  }, [currentTime, scenes])

  const handlePlay = () => {
    setIsPlaying(true)
    if (videoRef.current) videoRef.current.play()
    if (audioRef.current) audioRef.current.play()
  }

  const handlePause = () => {
    setIsPlaying(false)
    if (videoRef.current) videoRef.current.pause()
    if (audioRef.current) audioRef.current.pause()
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  if (!scenes || scenes.length === 0) {
    return (
      <div className="w-full h-full bg-gradient-to-br from-gray-900 to-black rounded-lg flex items-center justify-center border border-gray-800">
        <div className="text-center">
          <div className="text-6xl mb-4">🎬</div>
          <p className="text-gray-400">No scenes to preview</p>
          <p className="text-sm text-gray-500 mt-2">Add scenes to the timeline to get started</p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full h-full flex flex-col">
      {/* Video/Image Display */}
      <div className="flex-1 bg-black rounded-lg overflow-hidden relative">
        {videoAsset ? (
          <video
            ref={videoRef}
            src={videoAsset.url}
            className="w-full h-full object-contain"
            onTimeUpdate={(e) => {
              const time = e.currentTarget.currentTime
              onTimeUpdate?.(time)
            }}
          />
        ) : imageAsset ? (
          <img
            src={imageAsset.url}
            alt="Scene preview"
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900">
            <div className="text-center">
              <div className="text-6xl mb-2">⬜</div>
              <p className="text-gray-400">No media in this scene</p>
            </div>
          </div>
        )}

        {/* Audio (hidden) */}
        {audioAsset && (
          <audio ref={audioRef} src={audioAsset.url} />
        )}

        {/* Scene Info Overlay */}
        <div className="absolute top-4 left-4 bg-black/70 backdrop-blur-sm rounded-lg px-3 py-2">
          <p className="text-sm font-medium">
            Scene {currentSceneIndex + 1} of {scenes.length}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {formatTime(sceneTime)} / {formatTime(currentScene.duration)}
          </p>
        </div>

        {/* Controls Overlay */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
          {!isPlaying ? (
            <button
              onClick={handlePlay}
              className="bg-white/90 hover:bg-white text-black rounded-full p-3 transition-colors"
            >
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </button>
          ) : (
            <button
              onClick={handlePause}
              className="bg-white/90 hover:bg-white text-black rounded-full p-3 transition-colors"
            >
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Timeline Progress */}
      <div className="mt-4 px-4">
        <div className="relative h-2 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="absolute h-full bg-blue-500 transition-all"
            style={{ width: `${(currentTime / totalDuration) * 100}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-gray-400 mt-1">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(totalDuration)}</span>
        </div>
      </div>
    </div>
  )
}
