import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const POSTZEN_API_KEY = process.env.POSTZEN_API_KEY

// Webhook da PostZen para notificações de conta conectada
export async function POST(request: NextRequest) {
  try {
    // Verificar autenticação do webhook (PostZen envia a API key no header)
    const authHeader = request.headers.get('authorization')
    const webhookKey = authHeader?.replace('Bearer ', '')
    
    if (!webhookKey || webhookKey !== POSTZEN_API_KEY) {
      console.error('[webhook] Unauthorized webhook attempt')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    console.log('[webhook] Received:', JSON.stringify(body, null, 2))

    const { event, data } = body

    // Eventos possíveis da PostZen:
    // - account.connected
    // - account.disconnected
    // - post.published
    // - post.failed

    if (event === 'account.connected' && data?.platform === 'tiktok') {
      // Sincronizar a nova conta no Supabase
      const supabase = await createClient()
      
      // Buscar o usuário pelo profileId ou outro identificador
      // (PostZen deve enviar algum identificador que vincule ao usuário)
      const accountData = {
        postzen_account_id: data._id || data.accountId,
        username: data.username ?? data.displayName ?? 'tiktok',
        display_name: data.displayName ?? null,
        avatar_url: data.avatarUrl ?? null,
        status: 'active',
      }

      console.log('[webhook] Syncing TikTok account:', accountData)

      // Criar ou atualizar a conta
      // Nota: precisamos de user_id, que pode vir do webhook ou ser inferido
      const { error } = await supabase
        .from('tiktok_accounts')
        .upsert({
          ...accountData,
          // TODO: vincular ao user_id correto
          // Por enquanto, deixa null e o usuário sincroniza manualmente
        })

      if (error) {
        console.error('[webhook] Error syncing account:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ success: true, message: 'Account synced' })
    }

    if (event === 'post.published' && data?.platform === 'tiktok') {
      // Atualizar status do post no Supabase
      const supabase = await createClient()
      
      const { error } = await supabase
        .from('tiktok_posts')
        .update({
          status: 'published',
          views: data.analytics?.views || 0,
          likes: data.analytics?.likes || 0,
          comments: data.analytics?.comments || 0,
          shares: data.analytics?.shares || 0,
        })
        .eq('postzen_post_id', data._id || data.postId)

      if (error) {
        console.error('[webhook] Error updating post:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ success: true, message: 'Post updated' })
    }

    if (event === 'post.failed' && data?.platform === 'tiktok') {
      // Marcar post como falho
      const supabase = await createClient()
      
      const { error } = await supabase
        .from('tiktok_posts')
        .update({
          status: 'failed',
          error_message: data.errorMessage || data.error || 'Post failed',
        })
        .eq('postzen_post_id', data._id || data.postId)

      if (error) {
        console.error('[webhook] Error updating failed post:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ success: true, message: 'Post marked as failed' })
    }

    // Evento não tratado
    return NextResponse.json({ success: true, message: 'Event received but not processed' })
  } catch (error) {
    console.error('[webhook] Error processing webhook:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

// GET para verificar se o endpoint está funcionando
export async function GET() {
  return NextResponse.json({
    service: 'PostZen TikTok Webhook',
    status: 'online',
    endpoint: '/api/tiktok/webhook',
  })
}
