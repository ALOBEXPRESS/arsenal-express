'use client'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { toast } from 'sonner'

type Usage={used:number;pending:number;limit:number;maxLimit:number;globalAvailable:number}
const gb=(bytes:number)=>(bytes/1e9).toFixed(2)+' GB'
export function StorageSummary(){
 const [usage,setUsage]=useState<Usage|null>(null),[error,setError]=useState(false),[open,setOpen]=useState(false),[limit,setLimit]=useState(''),[saving,setSaving]=useState(false)
 const load=async()=>{const response=await fetch('/api/storage/usage',{cache:'no-store'});const data=await response.json();if(!response.ok)throw new Error(data.error);setUsage(data);setLimit(String(data.limit/1e6));setError(false)}
 useEffect(()=>{void load().catch(()=>setError(true))},[])
 const percent=usage?Math.min(100,usage.used/usage.limit*100):0
 return <section className="mb-6 rounded-xl border border-border bg-surface-1 p-5" aria-label="Armazenamento de mídias">
 <div className="flex items-center justify-between gap-4"><h2 className="font-display font-semibold">Seu armazenamento</h2><Button size="sm" variant="outline" onClick={()=>{setOpen(true);void load().catch(()=>setError(true))}}>Gerenciar</Button></div>
 <p className="my-3 text-sm text-muted-foreground">{error?'Não foi possível consultar o armazenamento.':usage?`${gb(usage.used)} de ${gb(usage.limit)} utilizados no R2`:'Consultando armazenamento...'}</p>
 <Progress value={percent} />
 {usage&&<p className="mt-2 text-xs text-muted-foreground">Disponível para novos uploads: {gb(Math.max(0,Math.min(usage.limit-usage.used,usage.globalAvailable)))}.{percent>=85?' Seu armazenamento está próximo do limite.':''}</p>}
 <Sheet open={open} onOpenChange={setOpen}><SheetContent className="overflow-y-auto px-6 py-8"><SheetTitle>Gerenciar armazenamento</SheetTitle><SheetDescription className="mt-2">Seu limite pessoal pode ser menor que a cota fornecida pelo sistema. A capacidade total é compartilhada.</SheetDescription>
 {usage&&<div className="mt-6 space-y-5"><p>Em uso ou reservado: <strong>{gb(usage.used)}</strong></p><p className="text-sm text-muted-foreground">Reservas e exclusões em processamento: {gb(usage.pending)}. O espaço permanece reservado até a expiração dos links de upload.</p><label className="block text-sm">Limite pessoal (MB)<input type="number" min={Math.ceil(usage.used/1e6)} max={usage.maxLimit/1e6} value={limit} onChange={e=>setLimit(e.target.value)} className="mt-2 w-full rounded-md border border-border bg-surface-0 p-2" /></label><Button disabled={saving} onClick={async()=>{setSaving(true);try{const response=await fetch('/api/storage/usage',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({limit:Math.floor(Number(limit)*1e6)})});const data=await response.json();if(!response.ok)throw new Error(data.error);await load();toast.success('Limite atualizado')}catch(e){toast.error(e instanceof Error?e.message:'Não foi possível salvar')}finally{setSaving(false)}}}>{saving?'Salvando...':'Salvar limite'}</Button><p className="text-xs text-muted-foreground">Estes valores controlam uploads do SyncExpress. Não representam a cobrança em GB-mês da Cloudflare nem incluem arquivos antigos do Supabase. Libere espaço pela biblioteca de mídias de cada projeto.</p></div>}
 </SheetContent></Sheet></section>
}
