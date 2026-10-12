'use client'

import { useState, useMemo, useRef } from 'react'
import { Search, Wand2, Upload, Heart } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useSFXManifest } from '@/hooks/useSFXManifest'
import { useAddSFXToTimeline } from '@/hooks/useAddSFXToTimeline'
import { useUploadCustomSFX } from '@/hooks/useUploadCustomSFX'
import { useFavoriteSFX } from '@/hooks/useFavoriteSFX'
import { usePlayhead } from '@/lib/stores/playhead'
import { SoundEffectCard } from './SoundEffectCard'
import type { SFXCategory, SoundEffect } from '@/types/project'
import { cn } from '@/lib/utils'

interface SoundEffectsLibraryProps {
  projectId: string
}

const CATEGORY_LABELS: Record<SFXCategory, string> = {
  whoosh: 'Whoosh',
  wish: 'Wish',
  ui: 'Interface',
  impact: 'Impacto',
  glitch: 'Glitch',
  suspense: 'Suspense',
  cinematic: 'Cinemático',
  comedy: 'Comédia',
  ambient: 'Ambiente',
  custom: 'Custom',
}

export function SoundEffectsLibrary({ projectId }: SoundEffectsLibraryProps) {
  const { data: manifest, isLoading, error } = useSFXManifest()
  const addSFX = useAddSFXToTimeline()
  const uploadSFX = useUploadCustomSFX()
  const { isFavorite, toggleFavorite, favorites } = useFavoriteSFX()
  const playheadTime = usePlayhead((s) => s.time)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const [searchQuery, setSearchQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState<SFXCategory | 'all' | 'favorites'>('all')

  // Filter effects by search and category
  const filteredEffects = useMemo(() => {
    if (!manifest?.effects) return []

    let effects = manifest.effects

    // Filter by favorites
    if (activeCategory === 'favorites') {
      effects = effects.filter((e) => isFavorite(e.id))
    }
    // Filter by category
    else if (activeCategory !== 'all') {
      effects = effects.filter((e) => e.category === activeCategory)
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      effects = effects.filter(
        (e) =>
          e.name.toLowerCase().includes(query) ||
          e.tags.some((tag) => tag.toLowerCase().includes(query)) ||
          e.category.toLowerCase().includes(query)
      )
    }

    return effects
  }, [manifest, activeCategory, searchQuery, isFavorite])

  // Count effects per category
  const categoryCounts = useMemo(() => {
    if (!manifest?.effects) return {} as Record<SFXCategory, number>
    
    const counts: Record<string, number> = {}
    manifest.effects.forEach((e) => {
      counts[e.category] = (counts[e.category] || 0) + 1
    })
    return counts as Record<SFXCategory, number>
  }, [manifest])

  const handleAddEffect = (effect: SoundEffect) => {
    addSFX.mutate({
      projectId,
      effect,
      position: playheadTime, // Add at current playhead position
    })
  }

  const handleUploadClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Get name without extension
    const nameWithoutExt = file.name.replace(/\.[^.]+$/, '')
    
    // Default to current category or whoosh
    const category = activeCategory === 'all' ? 'whoosh' : activeCategory

    await uploadSFX.mutateAsync({
      file,
      name: nameWithoutExt,
      category,
      tags: ['transition', 'custom'],
    })

    // Reset input
    e.target.value = ''
  }

  const categories: { id: SFXCategory | 'all' | 'favorites'; label: string; count: number; icon?: React.ReactNode }[] = [
    { id: 'all', label: 'Todos', count: manifest?.effects.length || 0 },
    { id: 'favorites', label: 'Favoritos', count: favorites.length, icon: <Heart className="h-3 w-3 fill-current" /> },
    ...Object.entries(CATEGORY_LABELS).map(([id, label]) => ({
      id: id as SFXCategory,
      label,
      count: categoryCounts[id as SFXCategory] || 0,
    })),
  ]

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center">
        <div className="space-y-2">
          <p className="text-sm text-destructive">Erro ao carregar biblioteca de efeitos</p>
          <p className="text-xs text-muted-foreground">{(error as Error).message}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="space-y-3 border-b border-border p-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-[15px] font-bold">Efeitos Sonoros</h2>
          <div className="flex items-center gap-2">
            <Button
              onClick={handleUploadClick}
              size="sm"
              variant="outline"
              className="h-7 text-[11px]"
              disabled={uploadSFX.isPending}
            >
              <Upload className="h-3 w-3" />
              {uploadSFX.isPending ? 'Enviando...' : 'Upload'}
            </Button>
            <span className="eyebrow flex items-center gap-1" title="Adicione efeitos na linha do tempo">
              <Wand2 className="h-3 w-3" />
              {manifest?.effects.length || 0} efeitos
            </span>
          </div>
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/mpeg,audio/mp3,audio/ogg,audio/wav,audio/webm,.mp3,.ogg,.wav,.webm"
          onChange={handleFileSelect}
          className="hidden"
        />

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Buscar efeitos..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-8 text-[12px]"
          />
        </div>

        {/* Category tabs */}
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Filtrar por categoria">
          {categories.map((cat) => (
            <button
              key={cat.id}
              role="tab"
              aria-selected={activeCategory === cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={cn(
                'flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-colors duration-200',
                activeCategory === cat.id 
                  ? cat.id === 'favorites' 
                    ? 'bg-red-500 text-white' 
                    : 'bg-primary text-primary-foreground'
                  : 'bg-surface-0 text-muted-foreground hover:bg-surface-3 hover:text-foreground'
              )}
            >
              {cat.icon}
              {cat.label} <span className="font-mono text-[10px] opacity-70">{cat.count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Effects grid */}
      <div className="flex-1 overflow-y-auto p-3">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-muted-foreground">Carregando efeitos...</p>
          </div>
        ) : filteredEffects.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">
                {searchQuery ? 'Nenhum efeito encontrado' : 'Nenhum efeito nesta categoria'}
              </p>
              {searchQuery && (
                <p className="text-xs text-muted-foreground/75">
                  Tente buscar por outro termo
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {filteredEffects.map((effect) => (
              <SoundEffectCard 
                key={effect.id} 
                effect={effect} 
                onAdd={handleAddEffect}
                isFavorite={isFavorite(effect.id)}
                onToggleFavorite={toggleFavorite}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
