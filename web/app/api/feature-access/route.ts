import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action')

  try {
    switch (action) {
      case 'check': {
        const feature = searchParams.get('feature')
        if (!feature) {
          return NextResponse.json({ error: 'Feature não especificada' }, { status: 400 })
        }

        // Verificar se tem acesso
        const { data: hasAccess } = await supabase.rpc('has_feature_access', {
          p_user_id: user.id,
          p_feature: feature,
        })

        // Verificar se é admin
        const { data: isAdmin } = await supabase.rpc('is_admin', {
          p_user_id: user.id,
        })

        return NextResponse.json({
          hasAccess: hasAccess || isAdmin, // Admin sempre tem acesso
          isAdmin: isAdmin || false,
        })
      }

      case 'my_requests': {
        const { data: requests, error } = await supabase
          .from('feature_access_requests')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })

        if (error) throw error
        return NextResponse.json({ requests: requests || [] })
      }

      case 'my_permissions': {
        const { data: permissions, error } = await supabase
          .from('feature_permissions')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })

        if (error) throw error
        return NextResponse.json({ permissions: permissions || [] })
      }

      case 'pending': {
        // Apenas admin
        const { data: isAdmin } = await supabase.rpc('is_admin', {
          p_user_id: user.id,
        })

        if (!isAdmin) {
          return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
        }

        const { data: requests, error } = await supabase
          .from('feature_access_requests')
          .select(`
            *,
            profiles!feature_access_requests_user_id_fkey(name, avatar_url)
          `)
          .eq('status', 'pending')
          .order('created_at', { ascending: true })

        if (error) throw error
        return NextResponse.json({ requests: requests || [] })
      }

      case 'all_permissions': {
        // Apenas admin
        const { data: isAdmin } = await supabase.rpc('is_admin', {
          p_user_id: user.id,
        })

        if (!isAdmin) {
          return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
        }

        const { data: permissions, error } = await supabase
          .from('feature_permissions')
          .select(`
            *,
            profiles!feature_permissions_user_id_fkey(name, avatar_url)
          `)
          .order('created_at', { ascending: false })

        if (error) throw error
        return NextResponse.json({ permissions: permissions || [] })
      }

      default:
        return NextResponse.json({ error: 'Ação não especificada' }, { status: 400 })
    }
  } catch (error: any) {
    console.error('Erro na API feature-access:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const body = await request.json()
  const { action } = body

  try {
    switch (action) {
      case 'request': {
        const { feature, reason } = body

        if (!feature) {
          return NextResponse.json({ error: 'Feature não especificada' }, { status: 400 })
        }

        // Verificar se já tem permissão
        const { data: hasAccess } = await supabase.rpc('has_feature_access', {
          p_user_id: user.id,
          p_feature: feature,
        })

        if (hasAccess) {
          return NextResponse.json({ error: 'Você já tem acesso a esta feature' }, { status: 400 })
        }

        // Verificar se já tem solicitação pendente
        const { data: existingRequest } = await supabase
          .from('feature_access_requests')
          .select('*')
          .eq('user_id', user.id)
          .eq('feature', feature)
          .eq('status', 'pending')
          .single()

        if (existingRequest) {
          return NextResponse.json({ error: 'Você já tem uma solicitação pendente' }, { status: 400 })
        }

        // Criar solicitação
        const { data: newRequest, error } = await supabase
          .from('feature_access_requests')
          .insert({
            user_id: user.id,
            feature,
            reason,
            status: 'pending',
          })
          .select()
          .single()

        if (error) throw error
        return NextResponse.json({ request: newRequest })
      }

      case 'approve': {
        const { requestId, expiresAt, notes } = body

        // Verificar se é admin
        const { data: isAdmin } = await supabase.rpc('is_admin', {
          p_user_id: user.id,
        })

        if (!isAdmin) {
          return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
        }

        // Buscar solicitação
        const { data: req, error: reqError } = await supabase
          .from('feature_access_requests')
          .select('*')
          .eq('id', requestId)
          .single()

        if (reqError || !req) {
          return NextResponse.json({ error: 'Solicitação não encontrada' }, { status: 404 })
        }

        // Atualizar status da solicitação
        await supabase
          .from('feature_access_requests')
          .update({
            status: 'approved',
            reviewed_by: user.id,
            reviewed_at: new Date().toISOString(),
            admin_notes: notes,
          })
          .eq('id', requestId)

        // Criar permissão
        const { error: permError } = await supabase.from('feature_permissions').insert({
          user_id: req.user_id,
          feature: req.feature,
          granted_by: user.id,
          expires_at: expiresAt || null,
          notes,
        })

        if (permError) throw permError
        return NextResponse.json({ success: true })
      }

      case 'reject': {
        const { requestId, adminNotes } = body

        // Verificar se é admin
        const { data: isAdmin } = await supabase.rpc('is_admin', {
          p_user_id: user.id,
        })

        if (!isAdmin) {
          return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
        }

        const { error } = await supabase
          .from('feature_access_requests')
          .update({
            status: 'rejected',
            reviewed_by: user.id,
            reviewed_at: new Date().toISOString(),
            admin_notes: adminNotes,
          })
          .eq('id', requestId)

        if (error) throw error
        return NextResponse.json({ success: true })
      }

      case 'revoke': {
        const { userId, feature } = body

        // Verificar se é admin
        const { data: isAdmin } = await supabase.rpc('is_admin', {
          p_user_id: user.id,
        })

        if (!isAdmin) {
          return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
        }

        const { error } = await supabase
          .from('feature_permissions')
          .delete()
          .eq('user_id', userId)
          .eq('feature', feature)

        if (error) throw error
        return NextResponse.json({ success: true })
      }

      default:
        return NextResponse.json({ error: 'Ação não especificada' }, { status: 400 })
    }
  } catch (error: any) {
    console.error('Erro na API feature-access:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
