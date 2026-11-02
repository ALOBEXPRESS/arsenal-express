'use client'

import { useState, useEffect } from 'react'
import { AudioLines, Clapperboard, Image as ImageIcon, Upload, Package, X, Trash2 } from 'lucide-react'
import { useAssets, useUploadAsset, useDeleteAsset } from '@/lib/hooks/useAssets'
import { AssetCard } from './AssetCard'
import { AssetUpload } from './AssetUpload'
import type { Asset, AssetType } from '@/types/project'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { sortByModificationDate } from '@/lib/timeline'
import { cn } from '@/lib/utils'
import { confirmDialog } from '@/components/ui/confirm'
import { toast } from 'sonner'

interface AssetLibraryProps {
  projectId: string
  onSelectAsset?: (asset: Asset) => void
}

const UPLOAD_COPY: Record<AssetType, { title: string; text: string }> = {
  video: { title: 'Clipes de vídeo', text: 'Selecione vários de uma vez. A ordem na timeline segue a data de modificação.' },
  audio: { title: 'Áudio', text: 'Um ou mais áudios. Marque como narração se for narração de fato.' },
  image: { title: 'Imagens', text: 'Fotos ou artes pra cenas estáticas (com animação de câmera).' },
  asset: { title: 'Assets Extras', text: 'Biblioteca da sua conta, disponível em todos os projetos. Favorite uma imagem, GIF ou vídeo para usar nas barras de overlay.' },
}

export function AssetLibrary({ projectId, onSelectAsset }: AssetLibraryProps) {
  const { data: assets, isLoading } = useAssets(projectId)
  const uploadAsset = useUploadAsset()
  const deleteAsset = useDeleteAsset()
  const [selected, setSelected] = useState<string[]>([])
  useEffect(() => { setSelected([]) }, [projectId])
  const toggle = (id: string) => setSelected(previous => previous.includes(id) ? previous.filter(x => x !== id) : [...previous, id])
  const [activeTab, setActiveTab] = useState<AssetType | 'all'>('all')
  const [showUpload, setShowUpload] = useState<AssetType | null>(null)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const previewAsset = assets?.find((asset) => asset.id === previewId && asset.type === 'video')

  const projectAssets = (assets || []).filter(a => a.type !== 'asset')
  const sorted = sortByModificationDate(assets || [])
  const filtered = activeTab === 'all' ? sorted : sorted.filter((a) => a.type === activeTab)
  const count = (t: AssetType) => sorted.filter((a) => a.type === t).length

  const tabs: { id: AssetType | 'all'; label: string; n: number }[] = [
    { id: 'all', label: 'Tudo', n: sorted.length },
    { id: 'video', label: 'Clipes', n: count('video') },
    { id: 'audio', label: 'Áudio', n: count('audio') },
    { id: 'image', label: 'Imagens', n: count('image') },
    { id: 'asset', label: 'Assets', n: count('asset') },
  ]

  const uploads: { type: AssetType; label: string; icon: React.ReactNode }[] = [
    { type: 'video', label: 'Clipes', icon: <Clapperboard className="h-4 w-4" /> },
    { type: 'audio', label: 'Áudio', icon: <AudioLines className="h-4 w-4" /> },
    { type: 'image', label: 'Imagem', icon: <ImageIcon className="h-4 w-4" /> },
    { type: 'asset', label: 'Assets', icon: <Package className="h-4 w-4" /> },
  ]

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 border-b border-border p-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-[15px] font-bold">Mídias</h2>
          <span className="eyebrow" title="Arraste clipes, imagens e áudios pra timeline">arraste → timeline</span>
        </div>

        <div className="grid grid-cols-4 gap-1.5">
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

        <button type="button" disabled={!projectAssets.length || deleteAsset.isPending} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive disabled:opacity-50" onClick={async () => {
          const ok = await confirmDialog({ title: `Excluir todas as ${projectAssets.length} mídias?`, description: 'Os arquivos serão removidos da biblioteca e cenas que os usam ficarão sem mídia. Esta ação não pode ser desfeita.', confirmLabel: 'Excluir todas', tone: 'danger' })
          if (!ok) return
          let removed = 0
          try { for (const asset of projectAssets) { await deleteAsset.mutateAsync(asset); removed++ } setPreviewId(null); toast.success(`${removed} mídias excluídas`) }
          catch (error) { toast.error(`Não foi possível excluir todas. ${removed} mídia(s) removida(s).`, { description: error instanceof Error ? error.message : undefined }) }
        }}><Trash2 className="h-3.5 w-3.5" /> Excluir mídias do projeto</button>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button type="button" onClick={() => setSelected(filtered.map(a => a.id))} disabled={!filtered.length}>Selecionar visíveis</button>
          {selected.length > 0 && <><button type="button" onClick={() => setSelected([])}>Limpar seleção</button><button type="button" disabled={deleteAsset.isPending} className="text-destructive" onClick={async () => {
            const targets = sorted.filter(a => selected.includes(a.id))
            if (!targets.length) return
            if (!await confirmDialog({ title: `Excluir ${targets.length} mídias selecionadas?`, description: 'Os arquivos serão removidos. Assets Extras são compartilhados: excluí-los afeta todos os seus projetos.', confirmLabel: 'Excluir selecionadas', tone: 'danger' })) return
            const removed: string[] = []
            try { for (const asset of targets) { await deleteAsset.mutateAsync(asset); removed.push(asset.id) } toast.success(`${removed.length} mídias excluídas`) }
            catch (error) { toast.error(error instanceof Error ? error.message : 'Falha ao excluir mídias') }
            finally { setSelected(previous => previous.filter(id => !removed.includes(id))); if (previewId && removed.includes(previewId)) setPreviewId(null) }
          }}>Excluir selecionadas ({selected.length})</button></>}
        </div>
        <div className="flex gap-1 rounded-lg bg-surface-0 p-1" role="tablist" aria-label="Filtrar mídias">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={activeTab === t.id}
              onClick={() => setActiveTab(t.id)}
              className={cn(
                'flex-1 cursor-pointer rounded-md px-1 py-1 text-[11px] transition-colors duration-200 min-w-0',
                activeTab === t.id ? 'bg-surface-3 text-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <span className="block truncate">{t.label} <span className="font-mono text-[10px] opacity-70">{t.n}</span></span>
            </button>
          ))}
        </div>
      </div>

      <Dialog open={!!showUpload} onOpenChange={(o: boolean) => !o && setShowUpload(null)}>
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
                onUpload={async (file, signal) => {
                  await uploadAsset.mutateAsync({ project_id: projectId, type: showUpload, file, signal })
                }}
                onComplete={() => setShowUpload(null)}
              />
            </div>
          </DialogContent>
        )}
      </Dialog>

      {previewAsset && (
        <section className="shrink-0 border-b border-border bg-surface-1 p-3" aria-label="Prévia da mídia">
          <div className="mb-2 flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="eyebrow">Prévia da mídia</p>
              <p className="truncate text-xs text-foreground" title={previewAsset.filename}>{previewAsset.filename}</p>
            </div>
            <button type="button" onClick={() => setPreviewId(null)} className="rounded p-1 text-muted-foreground hover:bg-white/10 hover:text-foreground" aria-label="Fechar prévia da mídia"><X className="h-4 w-4" /></button>
          </div>
          <video key={previewAsset.id} src={previewAsset.url} controls autoPlay playsInline preload="metadata" className="max-h-48 w-full rounded-md bg-black" aria-label={`Prévia de ${previewAsset.filename}`}>
            Seu navegador não consegue reproduzir este vídeo.
          </video>
        </section>
      )}

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
              <div key={asset.id} className={cn('relative rounded-lg', selected.includes(asset.id) && 'ring-2 ring-brand-cyan')} onClickCapture={e => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); e.stopPropagation(); toggle(asset.id) } }}>
              <input type="checkbox" aria-label={`Selecionar ${asset.filename}`} checked={selected.includes(asset.id)} onClick={e => e.stopPropagation()} onChange={() => toggle(asset.id)} className="absolute right-2 top-10 z-20 h-4 w-4 accent-primary" />
              <AssetCard asset={asset} onDelete={(a) => { if (a.id === previewId) setPreviewId(null); deleteAsset.mutate(a) }} onSelect={(a) => { if (a.type === 'video') setPreviewId(a.id); onSelectAsset?.(a) }} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
