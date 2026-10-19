'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { X, Upload, Calendar } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import {
  getTikTokAccounts,
  createTikTokPost,
  type TikTokAccount,
} from '@/lib/tiktok-api'

interface NewPostDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function NewPostDialog({ open, onOpenChange }: NewPostDialogProps) {
  const [accountId, setAccountId] = useState('')
  const [caption, setCaption] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [privacyLevel, setPrivacyLevel] = useState('publicToEveryone')

  const queryClient = useQueryClient()

  const { data: accounts = [] } = useQuery({
    queryKey: ['tiktok', 'accounts'],
    queryFn: getTikTokAccounts,
  })

  const createMutation = useMutation({
    mutationFn: createTikTokPost,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tiktok', 'posts'] })
      toast.success('Post agendado com sucesso!')
      onOpenChange(false)
      resetForm()
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const resetForm = () => {
    setAccountId('')
    setCaption('')
    setVideoUrl('')
    setScheduledAt('')
    setPrivacyLevel('publicToEveryone')
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!accountId) {
      toast.error('Selecione uma conta')
      return
    }

    if (!videoUrl.startsWith('https://')) {
      toast.error('URL do vídeo deve começar com https://')
      return
    }

    if (caption.length > 2200) {
      toast.error('Legenda não pode ter mais de 2.200 caracteres')
      return
    }

    createMutation.mutate({
      accountId,
      caption,
      videoUrl,
      scheduledAt: scheduledAt || undefined,
      privacyLevel,
    })
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="panel max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="font-display text-2xl font-bold">Nova Publicação TikTok</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Agende ou publique agora seu vídeo no TikTok
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={createMutation.isPending}
          >
            <X />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Conta */}
          <div>
            <Label htmlFor="account">Conta TikTok *</Label>
            <select
              id="account"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="mt-2 w-full rounded-lg border border-border bg-surface-2 px-4 py-2.5 text-sm focus:border-brand-pink focus:outline-none focus:ring-2 focus:ring-brand-pink/20"
              required
            >
              <option value="">Selecione uma conta</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  @{account.username} {account.display_name && `(${account.display_name})`}
                </option>
              ))}
            </select>
            {accounts.length === 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                Conecte uma conta na aba Contas primeiro
              </p>
            )}
          </div>

          {/* URL do Vídeo */}
          <div>
            <Label htmlFor="videoUrl">URL do vídeo *</Label>
            <div className="mt-2 flex gap-2">
              <Input
                id="videoUrl"
                type="url"
                placeholder="https://exemplo.com/video.mp4"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                required
              />
              <Button type="button" variant="outline" size="sm" title="Upload de vídeo">
                <Upload className="h-4 w-4" />
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              URL pública do vídeo (deve ser acessível via HTTPS)
            </p>
          </div>

          {/* Legenda */}
          <div>
            <Label htmlFor="caption">Legenda</Label>
            <Textarea
              id="caption"
              placeholder="Escreva uma legenda chamativa para seu vídeo... #hashtags"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={4}
              maxLength={2200}
              className="mt-2"
            />
            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>Máximo 2.200 caracteres</span>
              <span
                className={caption.length > 2000 ? 'text-yellow-500' : caption.length > 2100 ? 'text-red-500' : ''}
              >
                {caption.length} / 2200
              </span>
            </div>
          </div>

          {/* Privacidade */}
          <div>
            <Label htmlFor="privacy">Privacidade</Label>
            <select
              id="privacy"
              value={privacyLevel}
              onChange={(e) => setPrivacyLevel(e.target.value)}
              className="mt-2 w-full rounded-lg border border-border bg-surface-2 px-4 py-2.5 text-sm focus:border-brand-pink focus:outline-none focus:ring-2 focus:ring-brand-pink/20"
            >
              <option value="publicToEveryone">🌍 Público</option>
              <option value="mutualFollowFriends">👥 Amigos</option>
              <option value="followerOfCreator">👤 Seguidores</option>
              <option value="selfOnly">🔒 Apenas eu</option>
            </select>
          </div>

          {/* Agendamento */}
          <div>
            <Label htmlFor="scheduledAt">Agendar para (opcional)</Label>
            <div className="mt-2 relative">
              <Input
                id="scheduledAt"
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
              />
              <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Deixe em branco para publicar imediatamente
            </p>
          </div>

          {/* Botões */}
          <div className="flex gap-3 pt-4 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={createMutation.isPending}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending || !accountId || !videoUrl}
              className="flex-1 glow-pink"
            >
              {createMutation.isPending
                ? 'Agendando...'
                : scheduledAt
                ? '📅 Agendar post'
                : '🚀 Publicar agora'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
