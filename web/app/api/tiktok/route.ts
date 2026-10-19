import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const POSTZEN_API_KEY = process.env.POSTZEN_API_KEY
const POSTZEN_BASE_URL = 'https://api.postzen.dev'

async function postzen<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  if (!POSTZEN_API_KEY) {
    throw new Error('Chave da PostZen não configurada')
  }

  const res = await fetch(`${POSTZEN_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${POSTZEN_API_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })

  const text = await res.text()
  let body: any = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = { error: text }
  }

  if (!res.ok) {
    console.error('[postzen]', path, res.status, text.slice(0, 500))
    const msg = body?.error || body?.message || `PostZen respondeu ${res.status}`
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
  }

  return body as T
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')

    if (action === 'accounts') {
      const { data, error } = await supabase
        .from('tiktok_accounts')
        .select('id, postzen_account_id, username, display_name, avatar_url, status, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })

      if (error) throw new Error(error.message)
      return NextResponse.json({ accounts: data ?? [] })
    }

    if (action === 'posts') {
      const { data, error } = await supabase
        .from('tiktok_posts')
        .select('*')
        .eq('user_id', user.id)
        .order('scheduled_at', { ascending: false })

      if (error) throw new Error(error.message)
      return NextResponse.json({ posts: data ?? [] })
    }

    if (action === 'analytics') {
      const accountId = searchParams.get('accountId')
      if (!accountId) {
        return NextResponse.json({ error: 'Missing accountId' }, { status: 400 })
      }

      const { data, error } = await supabase
        .from('tiktok_posts')
        .select('views, likes, comments, shares')
        .eq('user_id', user.id)
        .eq('account_id', accountId)

      if (error) throw new Error(error.message)

      const stats = (data ?? []).reduce(
        (acc, post) => ({
          views: acc.views + (post.views || 0),
          likes: acc.likes + (post.likes || 0),
          comments: acc.comments + (post.comments || 0),
          shares: acc.shares + (post.shares || 0),
        }),
        { views: 0, likes: 0, comments: 0, shares: 0 }
      )

      return NextResponse.json({ analytics: stats })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    console.error('TikTok API GET error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { action, ...data } = body

    // Sincronizar contas da PostZen com Supabase
    if (action === 'sync_accounts') {
      const res = await postzen<{ accounts: any[] }>('/v1/accounts')
      const remote = (res.accounts ?? []).filter((a) => a.platform === 'tiktok')

      const { data: existing } = await supabase
        .from('tiktok_accounts')
        .select('id, postzen_account_id')
        .eq('user_id', user.id)

      const byRemote = new Map((existing ?? []).map((e) => [e.postzen_account_id, e.id]))

      for (const a of remote) {
        const row = {
          user_id: user.id,
          postzen_account_id: a._id,
          username: a.username ?? a.displayName ?? 'tiktok',
          display_name: a.displayName ?? null,
          avatar_url: a.avatarUrl ?? null,
          status: a.status === 'connected' && a.isActive !== false ? 'active' : String(a.status ?? 'inactive'),
        }

        const id = byRemote.get(a._id)
        const q = id
          ? supabase.from('tiktok_accounts').update(row).eq('id', id)
          : supabase.from('tiktok_accounts').insert(row)

        const { error } = await q
        if (error) throw new Error(error.message)
      }

      return NextResponse.json({ synced: remote.length })
    }

    // Obter URL de autorização do TikTok
    if (action === 'get_connect_url') {
      const profiles = await postzen<{ profiles: any[] }>('/v1/profiles')
      const profile = profiles.profiles?.find((p) => p.isDefault) ?? profiles.profiles?.[0]

      if (!profile) {
        return NextResponse.json({ error: 'Nenhum perfil PostZen encontrado' }, { status: 400 })
      }

      // Apenas profileId - PostZen usa seu callback padrão
      const qs = new URLSearchParams({ profileId: profile._id })
      const res = await postzen<{ authUrl: string }>(`/v1/connect/tiktok?${qs}`)

      return NextResponse.json({ authUrl: res.authUrl })
    }

    // Criar post no TikTok
    if (action === 'create_post') {
      const { accountId, caption, videoUrl, scheduledAt, privacyLevel } = data

      if (!accountId) {
        return NextResponse.json({ error: 'Escolha uma conta' }, { status: 400 })
      }

      const { data: acc, error: accErr } = await supabase
        .from('tiktok_accounts')
        .select('id, postzen_account_id')
        .eq('id', accountId)
        .eq('user_id', user.id)
        .single()

      if (accErr || !acc?.postzen_account_id) {
        return NextResponse.json({ error: 'Conta não encontrada' }, { status: 404 })
      }

      const scheduledIso = scheduledAt ? new Date(scheduledAt).toISOString() : null
      const postBody: any = {
        content: caption,
        mediaItems: [{ url: videoUrl }],
        platforms: [
          {
            platform: 'tiktok',
            accountId: acc.postzen_account_id,
            settings: { privacyLevel: privacyLevel || 'publicToEveryone', allowComments: true },
          },
        ],
      }

      if (scheduledIso) {
        postBody.scheduledFor = scheduledIso
      } else {
        postBody.publishNow = true
      }

      const res = await postzen<any>('/v1/posts', {
        method: 'POST',
        body: JSON.stringify(postBody),
        headers: { 'x-request-id': crypto.randomUUID() },
      })

      const post = res.post ?? res.existingPost ?? {}

      const { data: row, error } = await supabase
        .from('tiktok_posts')
        .insert({
          user_id: user.id,
          account_id: acc.id,
          caption,
          video_url: videoUrl,
          scheduled_at: scheduledIso ?? new Date().toISOString(),
          status: scheduledIso ? 'scheduled' : 'publishing',
          postzen_post_id: post._id ?? null,
        })
        .select('*')
        .single()

      if (error) throw new Error(error.message)
      return NextResponse.json({ post: row })
    }

    // Deletar post
    if (action === 'delete_post') {
      const { id } = data

      const { data: row } = await supabase
        .from('tiktok_posts')
        .select('postzen_post_id, status')
        .eq('id', id)
        .eq('user_id', user.id)
        .single()

      if (row?.postzen_post_id && row.status === 'scheduled') {
        try {
          await postzen(`/v1/posts/${row.postzen_post_id}`, { method: 'DELETE' })
        } catch (e) {
          console.error('[postzen] delete failed', e)
        }
      }

      const { error } = await supabase.from('tiktok_posts').delete().eq('id', id).eq('user_id', user.id)
      if (error) throw new Error(error.message)

      return NextResponse.json({ ok: true })
    }

    // Remover conta
    if (action === 'remove_account') {
      const { id } = data
      const { error } = await supabase.from('tiktok_accounts').delete().eq('id', id).eq('user_id', user.id)
      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true })
    }

    // Atualizar métricas dos posts
    if (action === 'refresh_posts') {
      const { data: rows } = await supabase
        .from('tiktok_posts')
        .select('id, postzen_post_id')
        .eq('user_id', user.id)
        .not('postzen_post_id', 'is', null)
        .order('scheduled_at', { ascending: false })
        .limit(30)

      let updated = 0
      for (const r of rows ?? []) {
        try {
          const res = await postzen<any>(`/v1/posts/${r.postzen_post_id}`)
          const p = res.post ?? res
          const plat = (p.platforms ?? []).find((x: any) => x.platform === 'tiktok') ?? {}
          const a = plat.analytics ?? p.analytics ?? {}

          const patch: any = {
            views: Number(a.views ?? a.viewCount) || 0,
            likes: Number(a.likes ?? a.likeCount) || 0,
            comments: Number(a.comments ?? a.commentCount) || 0,
            shares: Number(a.shares ?? a.shareCount) || 0,
          }

          const st = String(plat.status ?? p.status ?? '').toLowerCase()
          if (['published', 'posted', 'success', 'completed'].includes(st)) {
            patch.status = 'published'
          } else if (['failed', 'error'].includes(st)) {
            patch.status = 'failed'
          }

          const err = plat.errorMessage ?? plat.error ?? p.errorMessage
          if (err) patch.error_message = String(err)

          await supabase.from('tiktok_posts').update(patch).eq('id', r.id)
          updated++
        } catch (e) {
          console.error('[postzen] refresh failed', r.postzen_post_id, e)
        }
      }

      return NextResponse.json({ updated })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    console.error('TikTok API POST error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
