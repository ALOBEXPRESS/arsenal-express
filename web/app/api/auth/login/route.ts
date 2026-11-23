import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const origin = request.headers.get('origin')
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: 'Origem inválida.' }, { status: 403 })
  const input = z.object({ email: z.string().trim().email().max(254), password: z.string().min(1).max(1024) }).safeParse(await request.json().catch(() => null))
  if (!input.success) return NextResponse.json({ error: 'Informe e-mail e senha válidos.' }, { status: 400 })
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword(input.data)
  if (error) return NextResponse.json({ error: 'Não foi possível entrar. Confira suas credenciais, confirme seu e-mail e verifique se seu acesso foi autorizado.' }, { status: 401 })
  const { data: access, error: accessError } = await supabase.rpc('system_access_status')
  if (accessError || !access?.allowed) {
    await supabase.auth.signOut({ scope: 'local' })
    return NextResponse.json({ error: accessError ? 'A autorização de acesso está indisponível. Contate o administrador.' : 'Seu e-mail ainda não está autorizado. Solicite acesso a empresaalob@gmail.com.' }, { status: accessError ? 503 : 403 })
  }
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
}
