# Integração PostZen Analytics - TikTok Scheduler

## 📊 Resumo

Integração completa da API de Analytics do PostZen no TikTok Scheduler do Arsenal Express. O sistema agora busca métricas reais do TikTok através da PostZen API e atualiza automaticamente os status dos posts.

## ✨ Funcionalidades Implementadas

### 1. **API de Analytics Real**
- **Endpoint:** `GET /api/tiktok?action=analytics&accountId={id}`
- Busca métricas atualizadas de cada post via PostZen API
- Atualiza automaticamente as métricas no Supabase
- Calcula taxa de engajamento no servidor: `(likes + comments + shares) / views * 100`

### 2. **Auto-Refresh de Posts**
- Atualização automática a cada **30 segundos**
- Sincroniza status dos posts (agendado → processando → publicado)
- Atualiza métricas (views, likes, comments, shares) em tempo real
- Detecta falhas e atualiza mensagens de erro

### 3. **Dashboard de Analytics**
- **Seletor de Conta:** Escolha qual conta TikTok ver as métricas
- **Métricas Principais:**
  - Views totais
  - Curtidas totais
  - Comentários totais
  - Compartilhamentos totais
- **Estatísticas Detalhadas:**
  - Taxa de engajamento geral
  - Total de posts
  - Posts publicados
  - Média de views por post
- **Posts Recentes:** Lista filtrada por conta selecionada

### 4. **Status Badges Inteligentes**
- **Agendado** (azul): Post ainda não atingiu o horário
- **Processando** (amarelo): Horário passou, aguardando publicação do TikTok
- **Publicado** (verde): Post está ao vivo no TikTok
- **Erro** (vermelho): Falha na publicação

## 🔧 Implementação Técnica

### Servidor (`/api/tiktok/route.ts`)

```typescript
// Endpoint de analytics com refresh automático
if (action === 'analytics') {
  const accountId = searchParams.get('accountId')
  
  // 1. Busca posts desta conta
  const { data: rows } = await supabase
    .from('tiktok_posts')
    .select('id, postzen_post_id, status, scheduled_at')
    .eq('account_id', accountId)
    .not('postzen_post_id', 'is', null)

  // 2. Atualiza cada post com dados do PostZen
  for (const r of rows ?? []) {
    const res = await postzen<any>(`/v1/posts/${r.postzen_post_id}`)
    const analytics = res.post.platforms.find(p => p.platform === 'tiktok').analytics
    
    await supabase.from('tiktok_posts').update({
      views: analytics.views,
      likes: analytics.likes,
      comments: analytics.comments,
      shares: analytics.shares,
      status: determineStatus(res.post.status)
    }).eq('id', r.id)
  }

  // 3. Calcula métricas agregadas
  const stats = calculateEngagement(posts)
  return NextResponse.json({ analytics: stats })
}
```

### Cliente (`/app/(dashboard)/tiktok/page.tsx`)

```typescript
// Query de analytics com cache inteligente
const { data: analytics } = useQuery({
  queryKey: ['tiktok', 'analytics', selectedAccountForAnalytics],
  queryFn: () => getTikTokAnalytics(selectedAccountForAnalytics!),
  enabled: !!selectedAccountForAnalytics,
})

// Auto-refresh a cada 30 segundos
useEffect(() => {
  if (posts.length === 0) return
  
  const interval = setInterval(() => {
    refreshMutation.mutate()
  }, 30000)
  
  return () => clearInterval(interval)
}, [posts.length])
```

## 📈 Métricas Calculadas

### Taxa de Engajamento
```
engagementRate = ((likes + comments + shares) / views) × 100
```

### Média de Views
```
averageViews = totalViews / publishedPosts
```

### Status Inteligente
```
if (scheduled && timePassed) → "Processando"
if (postzen.status === "published") → "Publicado"
if (postzen.status === "failed") → "Erro"
else → "Agendado"
```

## 🎯 Fluxo de Dados

```
┌─────────────────┐
│  TikTok API     │
└────────┬────────┘
         │
         ↓ (webhook + polling)
┌─────────────────┐
│  PostZen API    │
└────────┬────────┘
         │
         ↓ (fetch metrics)
┌─────────────────┐
│  Next.js API    │  ← Auto-refresh 30s
└────────┬────────┘
         │
         ↓ (update)
┌─────────────────┐
│  Supabase DB    │
└────────┬────────┘
         │
         ↓ (query)
┌─────────────────┐
│  React Query    │  ← Cache + UI
└─────────────────┘
```

## 🚀 Próximos Passos

### Recomendações de Melhorias

1. **Webhook em Tempo Real**
   - Configurar webhook do PostZen para atualizar instantaneamente
   - Remover necessidade de polling constante

2. **Paginação de Posts**
   - Implementar scroll infinito ou paginação
   - Atualmente limita a 30 posts mais recentes

3. **Gráficos de Performance**
   - Chart.js ou Recharts para visualizar tendências
   - Views por dia, engajamento ao longo do tempo

4. **Notificações Push**
   - Avisar quando post for publicado
   - Alertar sobre erros de publicação

5. **Comparação de Contas**
   - Ver métricas de múltiplas contas lado a lado
   - Identificar qual conta performa melhor

6. **Export de Dados**
   - Baixar relatórios em CSV/PDF
   - Análise de dados para planejamento de conteúdo

## 🔒 Segurança

- ✅ API Key do PostZen armazenada apenas no servidor
- ✅ Validação de user_id em todas as queries
- ✅ RLS (Row Level Security) ativo no Supabase
- ✅ Rate limiting implícito do React Query (cache)
- ✅ Validação de permissões com AccessGuard

## 📝 Observações

- **Limites da PostZen API:** Verificar rate limits na documentação
- **Webhook:** Configurado em https://arsenalexpress.app/api/tiktok/webhook
- **Auto-refresh:** Só ativa quando há posts na lista
- **Cache:** React Query mantém dados em cache por 5 minutos
- **Status Sync:** Executado automaticamente antes de exibir analytics

## 🎨 UI/UX

- Design seguindo Arsenal Express (pink #fe2c55, cyan #25f4ee)
- Animações suaves de hover e transição
- Loading states para melhor feedback
- Empty states informativos
- Badges visuais para status dos posts

## 📦 Deploy

Build testado e aprovado:
```bash
npm run build
✓ Compiled successfully in 70s
✓ Checking validity of types
✓ Collecting page data
✓ Generating static pages (16/16)
```

**Deployed to:** https://arsenalexpress.app/tiktok
