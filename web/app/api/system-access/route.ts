import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

async function administrator() {
  const client = await createClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) return { response: NextResponse.json({ error: 'Não autenticado.' }, { status: 401 }), client }
  const { data, error } = await client.rpc('system_access_status')
  if (error || !data?.isAdmin) return { response: NextResponse.json({ error: 'Apenas o administrador pode gerenciar acessos.' }, { status: 403 }), client }
  return { response: null, client }
}

export async function GET() {
  const { client, response } = await administrator()
  if (response) return response
  const { data, error } = await client.from('system_access_allowlist').select('email,is_enabled,authorized_at,revoked_at').order('authorized_at', { ascending: false })
  if (error) return NextResponse.json({ error: 'Não foi possível carregar as autorizações.' }, { status: 503 })
  const { data: requests, error: requestsError } = await client.from('system_access_requests').select('id,email,name,status,created_at').order('created_at', { ascending: false }).limit(200)
  if (requestsError) return NextResponse.json({error:'Não foi possível carregar os pedidos.'},{status:503})
  return NextResponse.json({ entries: data, requests }, { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: 'Origem inválida.' }, { status: 403 })
  const { client, response } = await administrator()
  if (response) return response
  const body = await request.json().catch(() => null)
  const review = z.object({id:z.string().uuid(),action:z.enum(['approve','reject'])}).safeParse(body)
  if(review.success){
    const {error}=await client.rpc('review_access_request',{p_id:review.data.id,p_approve:review.data.action==='approve'})
    return error?NextResponse.json({error:'Não foi possível revisar o pedido.'},{status:400}):NextResponse.json({ok:true})
  }
  const input = z.object({ email: z.string().trim().email().max(254), action: z.enum(['grant', 'revoke']) }).safeParse(body)
  if (!input.success) return NextResponse.json({ error: 'Informe um e-mail válido.' }, { status: 400 })
  const { error } = await client.rpc(input.data.action === 'grant' ? 'grant_system_access' : 'revoke_system_access', { p_email: input.data.email })
  if (error) return NextResponse.json({ error: 'Não foi possível alterar o acesso. O administrador não pode ser revogado.' }, { status: 400 })
  return NextResponse.json({ ok: true })
}
