'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'

export default function TikTokSchedulerPage() {
  const [showNewPostModal, setShowNewPostModal] = useState(false)

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

      <Tabs defaultValue="posts" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="accounts">Contas</TabsTrigger>
          <TabsTrigger value="posts">Publicações</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="accounts">
          <div className="panel p-6">
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
              <Button className="mt-6" variant="outline">
                Conectar conta TikTok
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="posts">
          <div className="panel p-6">
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
          </div>
        </TabsContent>

        <TabsContent value="analytics">
          <div className="grid gap-6 md:grid-cols-4">
            {[
              { label: 'Views totais', value: '0', icon: '👁️' },
              { label: 'Engajamento médio', value: '0%', icon: '❤️' },
              { label: 'Posts este mês', value: '0', icon: '📊' },
              { label: 'Melhor horário', value: '--:--', icon: '⏰' },
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
            <h3 className="font-semibold mb-4">Desempenho (últimos 30 dias)</h3>
            <div className="flex h-64 items-center justify-center text-muted-foreground">
              <p className="text-sm">Conecte uma conta para ver analytics</p>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* TODO: Modal de criar post */}
    </div>
  )
}
