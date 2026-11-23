'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ACCESS_ADMIN_EMAIL } from '@/lib/system-access'

type Entry = { email: string; is_enabled: boolean; authorized_at: string; revoked_at: string | null }
export function AccessAllowlist() {
  const [entries, setEntries] = useState<Entry[]>([])
  const [requests,setRequests]=useState<{id:string;email:string;name:string;status:string;created_at:string}[]>([])
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const load = async () => {
    const response = await fetch('/api/system-access', { cache: 'no-store' })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Falha ao carregar acessos.')
    setEntries(data.entries); setRequests(data.requests)
  }
  useEffect(() => { load().catch(error => setError(error.message)) }, [])
  const change = async (target: string, action: 'grant' | 'revoke') => {
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/system-access', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: target, action }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Falha ao alterar acesso.')
      await load()
      if (action === 'grant') setEmail('')
      toast.success(action === 'grant' ? 'E-mail autorizado. A pessoa já pode criar sua conta e entrar.' : 'Acesso revogado.')
    } catch (error) { setError(error instanceof Error ? error.message : 'Falha ao alterar acesso.') }
    finally { setBusy(false) }
  }
  const review=async(id:string,action:'approve'|'reject')=>{
    setBusy(true);setError('')
    try{const r=await fetch('/api/system-access',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,action})});const d=await r.json();if(!r.ok)throw new Error(d.error);await load();toast.success(action==='approve'?'Pedido aprovado.':'Pedido recusado.')}
    catch(e){setError(e instanceof Error?e.message:'Falha ao revisar pedido.')}finally{setBusy(false)}
  }
  return <div className="mx-auto max-w-3xl space-y-6">
    <div><h1 className="text-2xl font-bold">Acesso ao sistema</h1><p className="mt-2 text-sm text-muted-foreground">Revise as solicitações abaixo ou autorize um e-mail manualmente. Somente esses endereços poderão acessar o SyncExpress.</p></div>
    <section className="space-y-3"><h2 className="text-lg font-semibold">Solicitações</h2>{requests.length===0&&<p className="text-sm text-muted-foreground">Nenhuma solicitação recebida.</p>}{requests.map(r=><div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-4"><div><p className="font-medium">{r.name}</p><p className="break-all text-sm">{r.email}</p><p className="text-xs text-muted-foreground">{r.status==='pending'?'Pendente':r.status==='approved'?'Aprovado':'Recusado'}</p></div>{r.status==='pending'&&<div className="flex gap-2"><Button disabled={busy} onClick={()=>void review(r.id,'approve')}>Aprovar</Button><Button variant="outline" disabled={busy} onClick={()=>void review(r.id,'reject')}>Recusar</Button></div>}</div>)}</section>
    <form className="flex flex-wrap gap-3 rounded-xl border border-border bg-surface-1 p-5" onSubmit={event => { event.preventDefault(); void change(email, 'grant') }}>
      <label className="flex-1 space-y-2 text-sm">E-mail para autorizar<input className="block w-full rounded-md border border-border bg-input px-3 py-2" type="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} placeholder="pessoa@exemplo.com" /></label>
      <Button className="self-end" disabled={busy} type="submit">{busy ? 'Salvando…' : 'Autorizar e-mail'}</Button>
    </form>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <div className="space-y-3"><div className="flex items-center justify-between rounded-lg border border-border p-4"><span>{ACCESS_ADMIN_EMAIL}</span><span className="text-sm text-primary">Administrador</span></div>
      {entries.filter(entry => entry.email !== ACCESS_ADMIN_EMAIL).map(entry => <div key={entry.email} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-4"><div><p className="break-all text-sm">{entry.email}</p><p className="text-xs text-muted-foreground">{entry.is_enabled ? 'Autorizado' : 'Revogado'}</p></div><Button variant="outline" disabled={busy} onClick={() => void change(entry.email, entry.is_enabled ? 'revoke' : 'grant')}>{entry.is_enabled ? 'Revogar acesso' : 'Autorizar novamente'}</Button></div>)}
    </div>
  </div>
}
