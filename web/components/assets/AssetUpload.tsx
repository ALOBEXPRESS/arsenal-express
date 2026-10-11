'use client'

import { useCallback, useState } from 'react'
import type { AssetType } from '@/types/project'

interface AssetUploadProps {
  projectId: string
  type: AssetType
  onUpload: (file: File) => Promise<void>
  /** Called once after the whole batch finishes */
  onComplete?: () => void
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

export function AssetUpload({ projectId, type, onUpload, onComplete }: AssetUploadProps) {
  const [uploading, setUploading] = useState(false)
  const [uploadCount, setUploadCount] = useState({ current: 0, total: 0 })
  const [dragActive, setDragActive] = useState(false)

  const handleFiles = useCallback(
    async (files: FileList) => {
      const acceptTypes = ACCEPT_TYPES[type].split(',')
      const maxMB = MAX_SIZES[type] / (1024 * 1024)
      
      // Validate all files first
      const validFiles: File[] = []
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        
        // Validate file type
        if (!acceptTypes.some((t) => file.type.match(t))) {
          alert(`Invalid file type for "${file.name}". Expected: ${ACCEPT_TYPES[type]}`)
          continue
        }

        // Validate file size
        if (file.size > MAX_SIZES[type]) {
          alert(`File "${file.name}" too large. Maximum size: ${maxMB}MB`)
          continue
        }
        
        validFiles.push(file)
      }

      if (validFiles.length === 0) return

      setUploading(true)
      setUploadCount({ current: 0, total: validFiles.length })
      
      const failed: string[] = []
      // Upload files sequentially to avoid overwhelming the server; one failure doesn't stop the batch
      for (let i = 0; i < validFiles.length; i++) {
        const file = validFiles[i]
        setUploadCount({ current: i + 1, total: validFiles.length })
        try {
          await onUpload(file)
        } catch (error) {
          console.error(`Upload failed for ${file.name}:`, error)
          failed.push(file.name)
        }
      }
      setUploading(false)
      setUploadCount({ current: 0, total: 0 })

      const ok = validFiles.length - failed.length
      if (failed.length > 0) {
        alert(`✅ ${ok} enviado(s)\n❌ ${failed.length} falharam:\n${failed.join('\n')}`)
      } else {
        alert(`✅ ${ok} arquivo(s) enviado(s)!`)
        onComplete?.()
      }
    },
    [type, onUpload, onComplete]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setDragActive(false)

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files)
      }
    },
    [handleFiles]
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
      if (e.target.files && e.target.files.length > 0) {
        handleFiles(e.target.files)
      }
    },
    [handleFiles]
  )

  return (
    <div
      className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
        dragActive
          ? 'border-primary bg-primary/10'
          : 'border-border hover:border-primary/50 bg-surface-0'
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
        multiple
      />

      <label
        htmlFor={`upload-${type}-${projectId}`}
        className="cursor-pointer block"
      >
        {uploading ? (
          <div className="flex flex-col items-center gap-2">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            <p className="text-sm text-muted-foreground">
              Enviando {uploadCount.current} de {uploadCount.total}...
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <svg
              className="w-8 h-8 text-muted-foreground"
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
            <p className="text-sm text-muted-foreground">
              Arraste aqui ou clique pra escolher
            </p>
            <p className="text-xs text-muted-foreground">
              Vários arquivos de uma vez · até {MAX_SIZES[type] / (1024 * 1024)}MB cada
            </p>
          </div>
        )}
      </label>
    </div>
  )
}
