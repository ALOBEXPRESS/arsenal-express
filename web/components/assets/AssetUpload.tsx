'use client'

import { useCallback, useState } from 'react'
import type { AssetType } from '@/types/project'
import { Button } from '@/components/ui/button'

interface AssetUploadProps {
  projectId: string
  type: AssetType
  onUpload: (file: File) => Promise<void>
}

const ACCEPT_TYPES = {
  video: 'video/mp4,video/webm,video/quicktime',
  audio: 'audio/mpeg,audio/wav,audio/x-m4a',
  image: 'image/jpeg,image/png,image/webp',
}

const MAX_SIZES = {
  video: 500 * 1024 * 1024, // 500MB
  audio: 100 * 1024 * 1024, // 100MB
  image: 10 * 1024 * 1024, // 10MB
}

export function AssetUpload({ projectId, type, onUpload }: AssetUploadProps) {
  const [uploading, setUploading] = useState(false)
  const [dragActive, setDragActive] = useState(false)

  const handleFile = useCallback(
    async (file: File) => {
      // Validate file type
      const acceptTypes = ACCEPT_TYPES[type].split(',')
      if (!acceptTypes.some((t) => file.type.match(t))) {
        alert(`Invalid file type. Expected: ${ACCEPT_TYPES[type]}`)
        return
      }

      // Validate file size
      if (file.size > MAX_SIZES[type]) {
        const maxMB = MAX_SIZES[type] / (1024 * 1024)
        alert(`File too large. Maximum size: ${maxMB}MB`)
        return
      }

      setUploading(true)
      try {
        await onUpload(file)
      } catch (error) {
        console.error('Upload failed:', error)
        alert('Upload failed. Please try again.')
      } finally {
        setUploading(false)
      }
    },
    [type, onUpload]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setDragActive(false)

      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleFile(e.dataTransfer.files[0])
      }
    },
    [handleFile]
  )

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }, [])

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
        handleFile(e.target.files[0])
      }
    },
    [handleFile]
  )

  return (
    <div
      className={`relative border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
        dragActive
          ? 'border-blue-500 bg-blue-500/10'
          : 'border-gray-700 hover:border-gray-600'
      }`}
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
    >
      <input
        type="file"
        id={`upload-${type}-${projectId}`}
        className="hidden"
        accept={ACCEPT_TYPES[type]}
        onChange={handleChange}
        disabled={uploading}
      />

      <label
        htmlFor={`upload-${type}-${projectId}`}
        className="cursor-pointer block"
      >
        {uploading ? (
          <div className="flex flex-col items-center gap-2">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white" />
            <p className="text-sm text-gray-400">Uploading...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <svg
              className="w-8 h-8 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            <p className="text-sm text-gray-400">
              Drop {type} here or click to browse
            </p>
            <p className="text-xs text-gray-500">
              Max {MAX_SIZES[type] / (1024 * 1024)}MB
            </p>
          </div>
        )}
      </label>
    </div>
  )
}
