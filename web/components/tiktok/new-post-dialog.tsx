'use client'

import { useState, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Upload, Calendar, Video, X, Loader2, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
  const [uploadProgress, setUploadProgress] = useState(0)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
    setUploadProgress(0)
    setIsUploading(false)
    setUploadedFile(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validações client-side
    const maxSize = 500 * 1024 * 1024 // 500MB
    if (file.size > maxSize) {
      toast.error('Arquivo muito grande. Máximo 500MB')
      return
    }

    const allowedTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm']
    if (!allowedTypes.includes(file.type)) {
      toast.error('Tipo de arquivo inválido. Use MP4, MOV, AVI ou WEBM')
      return
    }

    setIsUploading(true)
    setUploadedFile(file)
    setUploadProgress(0)

    try {
      const formData = new FormData()
      formData.append('file', file)

      // Simular progresso (upload real não tem progresso no fetch padrão)
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval)
            return prev
          }
          return prev + 10
        })
      }, 300)

      const response = await fetch('/api/upload/video', {
        method: 'POST',
        body: formData,
      })

      clearInterval(progressInterval)
      setUploadProgress(100)

      // Verificar se a resposta é JSON
      const contentType = response.headers.get('content-type')
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text()
        console.error('Upload error (non-JSON response):', text)
        throw new Error('Erro no servidor. Verifique se o bucket "tiktok-videos" existe no Supabase Storage.')
      }

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Falha no upload')
      }

      setVideoUrl(data.url)
      toast.success('Vídeo enviado com sucesso!')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao enviar vídeo')
      setUploadedFile(null)
      setVideoUrl('')
    } finally {
      setIsUploading(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!accountId) {
      toast.error('Selecione uma conta')
      return
    }

    if (!videoUrl) {
      toast.error('Adicione um vídeo ou URL')
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Nova Publicação TikTok</DialogTitle>
          <DialogDescription>
            Agende ou publique agora seu vídeo no TikTok
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 py-4">
          {/* Conta */}
          <div className="space-y-2">
            <Label htmlFor="account">Conta TikTok *</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger id="account">
                <SelectValue placeholder="Selecione uma conta" />
              </SelectTrigger>
              <SelectContent>
                {accounts.length === 0 ? (
                  <SelectItem value="none" disabled>
                    Nenhuma conta conectada
                  </SelectItem>
                ) : (
                  accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      <div className="flex items-center gap-2">
                        {account.avatar_url && (
                          <img 
                            src={account.avatar_url} 
                            alt="" 
                            className="w-4 h-4 rounded-full"
                          />
                        )}
                        <span>@{account.username}</span>
                        {account.display_name && (
                          <span className="text-muted-foreground">({account.display_name})</span>
                        )}
                      </div>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {accounts.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Conecte uma conta na aba Contas primeiro
              </p>
            )}
          </div>

          {/* Upload / URL do Vídeo */}
          <div className="space-y-2">
            <Label>Vídeo *</Label>
            
            {/* Área de Upload */}
            <div className="space-y-3">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="relative cursor-pointer rounded-lg border-2 border-dashed border-border hover:border-brand-pink/50 bg-surface-2 p-8 text-center transition-colors"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/mp4,video/quicktime,video/x-msvideo,video/webm"
                  onChange={handleFileSelect}
                  className="hidden"
                  disabled={isUploading}
                />
                
                {isUploading ? (
                  <div className="space-y-3">
                    <Loader2 className="mx-auto h-10 w-10 animate-spin text-brand-pink" />
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Enviando vídeo...</p>
                      <div className="w-full h-2 bg-surface-3 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-brand-pink transition-all duration-300"
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">{uploadProgress}%</p>
                    </div>
                  </div>
                ) : uploadedFile ? (
                  <div className="space-y-2">
                    <CheckCircle2 className="mx-auto h-10 w-10 text-green-500" />
                    <div>
                      <p className="text-sm font-medium flex items-center justify-center gap-2">
                        <Video className="h-4 w-4" />
                        {uploadedFile.name}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        setUploadedFile(null)
                        setVideoUrl('')
                        if (fileInputRef.current) fileInputRef.current.value = ''
                      }}
                    >
                      <X className="h-4 w-4 mr-1" />
                      Remover
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Upload className="mx-auto h-10 w-10 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Clique para fazer upload</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        MP4, MOV, AVI ou WEBM (máx. 500MB)
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Ou URL */}
              {!uploadedFile && !isUploading && (
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">ou</span>
                  </div>
                </div>
              )}

              {!uploadedFile && !isUploading && (
                <div>
                  <Input
                    type="url"
                    placeholder="https://exemplo.com/video.mp4"
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                  />
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Cole a URL pública de um vídeo hospedado
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Legenda */}
          <div className="space-y-2">
            <Label htmlFor="caption">Legenda</Label>
            <Textarea
              id="caption"
              placeholder="Escreva uma legenda chamativa... #hashtags"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={4}
              maxLength={2200}
            />
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Máximo 2.200 caracteres</span>
              <span
                className={
                  caption.length > 2100
                    ? 'text-red-500 font-medium'
                    : caption.length > 2000
                    ? 'text-yellow-500 font-medium'
                    : 'text-muted-foreground'
                }
              >
                {caption.length} / 2200
              </span>
            </div>
          </div>

          {/* Privacidade */}
          <div className="space-y-2">
            <Label htmlFor="privacy">Privacidade</Label>
            <Select value={privacyLevel} onValueChange={setPrivacyLevel}>
              <SelectTrigger id="privacy">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="publicToEveryone">🌍 Público</SelectItem>
                <SelectItem value="mutualFollowFriends">👥 Amigos</SelectItem>
                <SelectItem value="followerOfCreator">👤 Seguidores</SelectItem>
                <SelectItem value="selfOnly">🔒 Apenas eu</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Agendamento */}
          <div className="space-y-2">
            <Label htmlFor="scheduledAt">Agendar para (opcional)</Label>
            <div className="relative">
              <Input
                id="scheduledAt"
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
              />
              <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            </div>
            <p className="text-xs text-muted-foreground">
              Deixe em branco para publicar imediatamente
            </p>
          </div>

          {/* Botões */}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={createMutation.isPending || isUploading}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending || isUploading || !accountId || !videoUrl}
              className="glow-pink"
            >
              {createMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Agendando...
                </>
              ) : scheduledAt ? (
                <>
                  <Calendar className="mr-2 h-4 w-4" />
                  Agendar post
                </>
              ) : (
                <>
                  🚀 Publicar agora
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
