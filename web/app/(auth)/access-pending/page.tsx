import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ACCESS_ADMIN_EMAIL, ACCESS_REQUEST_URL } from '@/lib/system-access'

export default async function AccessPendingPage() {
  const client = await createClient()
  const { data: { user } } = await client.auth.getUser()
  if (user) {
    const { data } = await client.rpc('system_access_status')
    if (data?.allowed) redirect('/dashboard')
  }
  async function signOut() {
    'use server'
    const client = await createClient()
    await client.auth.signOut({ scope: 'local' })
    redirect('/login')
  }
  return <div className="space-y-5 rounded-xl border border-border bg-surface-1 p-6">
    <h1 className="text-2xl font-bold">Acesso mediante autorização</h1>
    <p className="text-sm text-muted-foreground">Envie o e-mail que você deseja usar no sistema para <a className="text-primary underline" href={ACCESS_REQUEST_URL}>{ACCESS_ADMIN_EMAIL}</a>. O administrador precisa autorizar esse endereço antes de você entrar.</p>
    {user?.email && <p className="text-sm">Sua conta: <strong>{user.email}</strong></p>}
    <p className="text-sm text-muted-foreground">Depois da aprovação, crie sua conta se necessário, confirme seu e-mail e entre normalmente.</p>
    <a className="block rounded-md bg-primary p-3 text-center font-semibold text-primary-foreground" href={ACCESS_REQUEST_URL}>Solicitar acesso por e-mail</a>
    <Link className="block text-center text-sm text-primary" href="/login">Voltar ao login</Link>
    {user && <form action={signOut}><button className="w-full text-sm text-muted-foreground" type="submit">Sair desta conta</button></form>}
  </div>
}
