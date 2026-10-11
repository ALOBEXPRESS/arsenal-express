'use client'

import { useState } from 'react'
import { AudioLines, Clapperboard, Image as ImageIcon, Upload } from 'lucide-react'
import { useAssets, useUploadAsset, useDeleteAsset } from '@/lib/hooks/useAssets'
import { AssetCard } from './AssetCard'
import { AssetUpload } from './AssetUpload'
import type { Asset, AssetType } from '@/types/project'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { sortByModificationDate } from '@/lib/timeline'
import { cn } from '@/lib/utils'

interface AssetLibraryProps {
  projectId: string
  onSelectAsset?: (asset: Asset) => void
}

const UPLOAD_COPY: Record<AssetType, { title: string; text: string }> = {
  video: { title: 'Clipes de vídeo', text: 'Selecione vários de uma vez. A ordem na timeline segue a data de modificação.' },
  audio: { title: 'Narração', text: 'Um ou mais áudios. Partes da narração são unidas na ordem de modificação.' },
  image: { title: 'Imagens', text: 'Fotos ou artes pra cenas estáticas (com animação de câmera).' },
}

export function AssetLibrary({ projectId, onSelectAsset }: AssetLibraryProps) {
  const { data: assets, isLoading } = useAssets(projectId)
  const uploadAsset = useUploadAsset()
  const deleteAsset = useDeleteAsset()
  const [activeTab, setActiveTab] = useState<AssetType | 'all'>('all')
  const [showUpload, setShowUpload] = useState<AssetType | null>(null)

  const sorted = sortByModificationDate(assets || [])
  const filtered = activeTab === 'all' ? sorted : sorted.filter((a) => a.type === activeTab)
  const count = (t: AssetType) => sorted.filter((a) => a.type === t).length

  const tabs: { id: AssetType | 'all'; label: string; n: number }[] = [
    { id: 'all', label: 'Tudo', n: sorted.length },
    { id: 'video', label: 'Clipes', n: count('video') },
    { id: 'audio', label: 'Áudio', n: count('audio') },
    { id: 'image', label: 'Imagens', n: count('image') },
  ]

  const uploads: { type: AssetType; label: string; icon: React.ReactNode }[] = [
    { type: 'video', label: 'Clipes', icon: <Clapperboard className="h-4 w-4" /> },
    { type: 'audio', label: 'Narração', icon: <AudioLines className="h-4 w-4" /> },
    { type: 'image', label: 'Imagem', icon: <ImageIcon className="h-4 w-4" /> },
  ]

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 border-b border-border p-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-[15px] font-bold">Mídias</h2>
          <span className="eyebrow" title="Arraste clipes, imagens e áudios pra timeline">arraste → timeline</span>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          {uploads.map((u) => (
            <button
              key={u.type}
              type="button"
              onClick={() => setShowUpload(u.type)}
              className="flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed border-border py-2 text-[11px] text-muted-foreground transition-colors duration-200 hover:border-primary/60 hover:bg-primary/5 hover:text-foreground"
            >
              <span className="flex items-center gap-1">
                <Upload className="h-3 w-3" aria-hidden />
                {u.icon}
              </span>
              {u.label}
            </button>
          ))}
        </div>

        <div className="flex gap-1 rounded-lg bg-surface-0 p-1" role="tablist" aria-label="Filtrar mídias">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={activeTab === t.id}
              onClick={() => setActiveTab(t.id)}
              className={cn(
                'flex-1 cursor-pointer rounded-md px-1.5 py-1 text-[11px] transition-colors duration-200',
                activeTab === t.id ? 'bg-surface-3 text-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {t.label} <span className="font-mono text-[10px] opacity-70">{t.n}</span>
            </button>
          ))}
        </div>
      </div>

      <Dialog open={!!showUpload} onOpenChange={(o) => !o && setShowUpload(null)}>
        {showUpload && (
          <DialogContent className="w-[min(92vw,460px)]">
            <DialogHeader>
              <p className="eyebrow flex items-center gap-2">
                <span className="tally" aria-hidden /> Upload
              </p>
              <DialogTitle className="font-display text-xl">{UPLOAD_COPY[showUpload].title}</DialogTitle>
              <DialogDescription>{UPLOAD_COPY[showUpload].text}</DialogDescription>
            </DialogHeader>
            <div className="mt-4">
              <AssetUpload
                projectId={projectId}
                type={showUpload}
                onUpload={async (file) => {
                  await uploadAsset.mutateAsync({ project_id: projectId, type: showUpload, file })
                }}
                onComplete={() => setShowUpload(null)}
              />
            </div>
          </DialogContent>
        )}
      </Dialog>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {isLoading ? (
          <div className="grid grid-cols-2 gap-2">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="aspect-[4/3] animate-pulse rounded-lg bg-surface-2" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border py-10 text-center text-[13px] text-muted-foreground">
            Nada aqui ainda.
            <br />
            Suba clipes e a narração acima.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {filtered.map((asset) => (
              <AssetCard key={asset.id} asset={asset} onDelete={(a) => deleteAsset.mutate(a)} onSelect={onSelectAsset} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
