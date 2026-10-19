'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, RefreshCw, Trash2, Video, Clock, Calendar } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { NewPostDialog } from '@/components/tiktok/new-post-dialog'
import { AccessGuard } from '@/components/feature-access/AccessGuard'
import {
  getTikTokAccounts,
  getTikTokPosts,
  syncTikTokAccounts,
  openTikTokAuth,
  removeTikTokAccount,
  deleteTikTokPost,
  refreshTikTokPosts,
  type TikTokAccount,
  type TikTokPost,
} from '@/lib/tiktok-api'

export default function TikTokSchedulerPage() {
  return (
    <AccessGuard feature="tiktok_scheduler" featureLabel="TikTok Scheduler">
      <TikTokSchedulerContent />
    </AccessGuard>
  )
}

function TikTokSchedulerContent() {
  const [showNewPostModal, setShowNewPostModal] = useState(false)
  const [activeTab, setActiveTab] = useState('accounts')
  const queryClient = useQueryClient()

  // Queries
  const { data: accounts = [], isLoading: accountsLoading } = useQuery({
    queryKey: ['tiktok', 'accounts'],
    queryFn: getTikTokAccounts,
  })

  const { data: posts = [], isLoading: postsLoading } = useQuery({
    queryKey: ['tiktok', 'posts'],
    queryFn: getTikTokPosts,
  })

  // Mutations
  const connectMutation = useMutation({
    mutationFn: async () => {
      await openTikTokAuth()
      // Após fechar o popup, sincroniza as contas
      const result = await syncTikTokAccounts()
      return result
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['tiktok', 'accounts'] })
      if (result.synced > 0) {
        toast.success(`${result.synced} conta(s) sincronizada(s) com sucesso!`)
      } else {
        toast.warning('Nenhuma conta encontrada. Verifique se a autorização foi concluída.')
      }
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const syncMutation = useMutation({
    mutationFn: syncTikTokAccounts,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['tiktok', 'accounts'] })
      toast.success(`${result.synced} conta(s) sincronizada(s)`)
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const removeMutation = useMutation({
    mutationFn: removeTikTokAccount,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tiktok', 'accounts'] })
      toast.success('Conta removida')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const deletePostMutation = useMutation({
    mutationFn: deleteTikTokPost,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tiktok', 'posts'] })
      toast.success('Post removido')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const refreshMutation = useMutation({
    mutationFn: refreshTikTokPosts,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['tiktok', 'posts'] })
      toast.success(`${result.updated} post(s) atualizado(s)`)
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  // Check URL params for TikTok connection callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('tiktok_connected') === '1') {
      setActiveTab('accounts')
      // Remove param from URL
      window.history.replaceState({}, '', '/tiktok')
      // Sync accounts after connection
      syncMutation.mutate()
    }
  }, [])

  return (
    <div className="animate-rise-in">
      <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow flex items-center gap-2">
            <span className="tally" aria-hidden /> TikTok Scheduler
          </p>
          <h1 className="mt-3 font-display text-4xl font-extrabold tracking-tight">
            Agendamento TikTok
          </h1>
          <p className="mt-1 text-muted-foreground">
            Publique e agende vídeos nas suas contas TikTok.
          </p>
        </div>
        <Button size="lg" onClick={() => setShowNewPostModal(true)} className="glow-pink">
          <Plus /> Nova Publicação
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="accounts">
            Contas {accounts.length > 0 && `(${accounts.length})`}
          </TabsTrigger>
          <TabsTrigger value="posts">
            Publicações {posts.length > 0 && `(${posts.length})`}
          </TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="accounts">
          <div className="panel p-6">
            {accountsLoading ? (
              <div className="text-center py-12">
                <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent" />
                <p className="mt-4 text-sm text-muted-foreground">Carregando contas...</p>
              </div>
            ) : accounts.length === 0 ? (
              <div className="text-center py-12">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-cyan/20">
                  <svg 
                    className="h-8 w-8 text-brand-cyan" 
                    viewBox="0 0 24 24" 
                    fill="currentColor"
                  >
                    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
                  </svg>
                </div>
                <h3 className="font-display text-xl font-bold">Nenhuma conta conectada</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Conecte sua conta TikTok para começar a agendar posts.
                </p>
                <Button 
                  className="mt-6" 
                  variant="outline"
                  onClick={() => connectMutation.mutate()}
                  disabled={connectMutation.isPending}
                >
                  {connectMutation.isPending ? 'Conectando...' : 'Conectar conta TikTok'}
                </Button>
              </div>
            ) : (
              <>
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="font-semibold">Suas contas</h3>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => syncMutation.mutate()}
                      disabled={syncMutation.isPending}
                    >
                      <RefreshCw className={syncMutation.isPending ? 'animate-spin' : ''} />
                      Sincronizar
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => connectMutation.mutate()}
                      disabled={connectMutation.isPending}
                    >
                      <Plus /> Adicionar conta
                    </Button>
                  </div>
                </div>
                <div className="space-y-3">
                  {accounts.map((account) => (
                    <div
                      key={account.id}
                      className="flex items-center justify-between rounded-lg border border-border bg-surface-2 p-4"
                    >
                      <div className="flex items-center gap-3">
                        {account.avatar_url ? (
                          <img
                            src={account.avatar_url}
                            alt={account.username}
                            className="h-10 w-10 rounded-full"
                          />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-cyan/20">
                            <span className="text-lg">🎵</span>
                          </div>
                        )}
                        <div>
                          <p className="font-semibold">{account.display_name || account.username}</p>
                          <p className="text-sm text-muted-foreground">@{account.username}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-medium ${
                            account.status === 'active'
                              ? 'bg-green-500/20 text-green-400'
                              : 'bg-yellow-500/20 text-yellow-400'
                          }`}
                        >
                          {account.status === 'active' ? 'Ativa' : account.status}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            if (confirm(`Remover conta @${account.username}?`)) {
                              removeMutation.mutate(account.id)
                            }
                          }}
                          disabled={removeMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </TabsContent>

        <TabsContent value="posts">
          <div className="panel p-6">
            {postsLoading ? (
              <div className="text-center py-12">
                <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent" />
                <p className="mt-4 text-sm text-muted-foreground">Carregando posts...</p>
              </div>
            ) : posts.length === 0 ? (
              <div className="text-center py-12">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-surface-3">
                  <Plus className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="font-display text-xl font-bold">Nenhum post agendado</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Crie seu primeiro post para agendar no TikTok.
                </p>
                <Button className="mt-6 glow-pink" onClick={() => setShowNewPostModal(true)}>
                  <Plus /> Criar primeiro post
                </Button>
              </div>
            ) : (
              <>
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="font-semibold">Posts agendados</h3>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => refreshMutation.mutate()}
                    disabled={refreshMutation.isPending}
                  >
                    <RefreshCw className={refreshMutation.isPending ? 'animate-spin' : ''} />
                    Atualizar métricas
                  </Button>
                </div>
                <div className="space-y-4">
                  {posts.map((post) => (
                    <div
                      key={post.id}
                      className="group relative overflow-hidden rounded-xl border border-border bg-surface-2 transition-all hover:border-brand-pink/50 hover:shadow-lg hover:shadow-brand-pink/10"
                    >
                      <div className="flex gap-4 p-4">
                        {/* Video Thumbnail */}
                        <div className="relative shrink-0">
                          <div className="relative h-28 w-20 overflow-hidden rounded-lg bg-surface-3">
                            {post.video_url ? (
                              <video
                                src={post.video_url}
                                className="h-full w-full object-cover"
                                muted
                                playsInline
                                onMouseEnter={(e) => e.currentTarget.play()}
                                onMouseLeave={(e) => {
                                  e.currentTarget.pause()
                                  e.currentTarget.currentTime = 0
                                }}
                              />
                            ) : (
                              <div className="flex h-full items-center justify-center">
                                <Video className="h-8 w-8 text-muted-foreground" />
                              </div>
                            )}
                            {/* Status Badge Overlay */}
                            <div className="absolute bottom-1 right-1">
                              {post.status === 'scheduled' && (
                                <span className="flex items-center gap-1 rounded-full bg-cyan-500/90 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
                                  <Clock className="h-3 w-3" />
                                  Agendado
                                </span>
                              )}
                              {post.status === 'published' && (
                                <span className="flex items-center gap-1 rounded-full bg-green-500/90 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
                                  ✓ Publicado
                                </span>
                              )}
                              {post.status === 'failed' && (
                                <span className="flex items-center gap-1 rounded-full bg-red-500/90 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
                                  ✕ Erro
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="font-medium line-clamp-2 text-white group-hover:text-brand-pink transition-colors">
                                {post.caption || 'Sem legenda'}
                              </p>
                              
                              {/* Metrics */}
                              <div className="mt-3 flex flex-wrap gap-3 text-sm text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <span className="text-lg">👁️</span>
                                  <span className="font-medium">{post.views.toLocaleString()}</span>
                                </span>
                                <span className="flex items-center gap-1">
                                  <span className="text-lg">❤️</span>
                                  <span className="font-medium">{post.likes.toLocaleString()}</span>
                                </span>
                                <span className="flex items-center gap-1">
                                  <span className="text-lg">💬</span>
                                  <span className="font-medium">{post.comments.toLocaleString()}</span>
                                </span>
                                <span className="flex items-center gap-1">
                                  <span className="text-lg">📤</span>
                                  <span className="font-medium">{post.shares.toLocaleString()}</span>
                                </span>
                              </div>

                              {/* Date & Time */}
                              <div className="mt-2 flex items-center gap-2 text-xs">
                                <span className="flex items-center gap-1 text-brand-cyan">
                                  <Calendar className="h-3 w-3" />
                                  {new Date(post.scheduled_at).toLocaleDateString('pt-BR', {
                                    day: '2-digit',
                                    month: 'short',
                                    year: 'numeric',
                                  })}
                                </span>
                                <span className="text-muted-foreground">•</span>
                                <span className="text-muted-foreground">
                                  {new Date(post.scheduled_at).toLocaleTimeString('pt-BR', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </span>
                              </div>

                              {/* Error Message */}
                              {post.error_message && (
                                <div className="mt-2 rounded-md bg-red-500/10 border border-red-500/20 px-2 py-1">
                                  <p className="text-xs text-red-400">{post.error_message}</p>
                                </div>
                              )}
                            </div>

                            {/* Delete Button */}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => {
                                if (confirm('Deletar este post?')) {
                                  deletePostMutation.mutate(post.id)
                                }
                              }}
                              disabled={deletePostMutation.isPending}
                            >
                              <Trash2 className="h-4 w-4 text-red-400" />
                            </Button>
                          </div>
                        </div>
                      </div>

                      {/* Hover Glow Effect */}
                      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                        <div className="absolute inset-0 bg-gradient-to-r from-brand-pink/5 to-brand-cyan/5" />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </TabsContent>

        <TabsContent value="analytics">
          <div className="grid gap-6 md:grid-cols-4">
            {[
              { label: 'Views totais', value: posts.reduce((sum, p) => sum + p.views, 0).toLocaleString(), icon: '👁️' },
              { 
                label: 'Engajamento médio', 
                value: posts.length > 0 
                  ? `${Math.round(posts.reduce((sum, p) => sum + p.likes + p.comments, 0) / posts.length)}` 
                  : '0',
                icon: '❤️' 
              },
              { label: 'Posts este mês', value: posts.length.toString(), icon: '📊' },
              { label: 'Posts publicados', value: posts.filter(p => p.status === 'published').length.toString(), icon: '✅' },
            ].map((metric) => (
              <div key={metric.label} className="panel p-6">
                <div className="flex items-center justify-between">
                  <span className="text-2xl" aria-hidden>{metric.icon}</span>
                  <span className="text-xs text-muted-foreground">{metric.label}</span>
                </div>
                <p className="mt-4 font-display text-3xl font-bold">{metric.value}</p>
              </div>
            ))}
          </div>

          <div className="panel mt-6 p-6">
            <h3 className="font-semibold mb-4">Posts recentes</h3>
            {posts.length === 0 ? (
              <div className="flex h-64 items-center justify-center text-muted-foreground">
                <p className="text-sm">Conecte uma conta e crie posts para ver analytics</p>
              </div>
            ) : (
              <div className="space-y-2">
                {posts.slice(0, 10).map((post) => (
                  <div key={post.id} className="flex justify-between items-center py-2 border-b border-border">
                    <p className="text-sm flex-1 line-clamp-1">{post.caption}</p>
                    <div className="flex gap-3 text-xs text-muted-foreground">
                      <span>👁️ {post.views}</span>
                      <span>❤️ {post.likes}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <NewPostDialog open={showNewPostModal} onOpenChange={setShowNewPostModal} />
    </div>
  )
}
