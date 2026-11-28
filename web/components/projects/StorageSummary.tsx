'use client'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { toast } from 'sonner'
import {confirmDialog} from '@/components/ui/confirm'

type Usage={used:number;pending:number;limit:number;maxLimit:number;globalAvailable:number}
const gb=(bytes:number)=>(bytes/1e9).toFixed(2)+' GB'
type StoredFile={id:string;name:string;project:string;bytes:number;provider:string;reason:string;protected:boolean}
export function StorageSummary(){
 const [files,setFiles]=useState<StoredFile[]>([]),[filesLoading,setFilesLoading]=useState(false),[filesError,setFilesError]=useState(''),[search,setSearch]=useState(''),[deleting,setDeleting]=useState<string|null>(null)
 const loadFiles=async()=>{setFilesLoading(true);setFilesError('');try{const r=await fetch('/api/storage/files',{cache:'no-store'});const d=await r.json();if(!r.ok)throw Error(d.error);setFiles(d.files)}catch(e){setFilesError(e instanceof Error?e.message:'Falha ao listar arquivos.')}finally{setFilesLoading(false)}}
 const [usage,setUsage]=useState<Usage|null>(null),[error,setError]=useState(false),[open,setOpen]=useState(false),[limit,setLimit]=useState(''),[saving,setSaving]=useState(false)
 const load=async()=>{const response=await fetch('/api/storage/usage',{cache:'no-store'});const data=await response.json();if(!response.ok)throw new Error(data.error);setUsage(data);setLimit(String(data.limit/1e6));setError(false)}
 useEffect(()=>{void load().catch(()=>setError(true))},[])
 const percent=usage?Math.min(100,usage.used/usage.limit*100):0
 return <section className="mb-6 rounded-xl border border-border bg-surface-1 p-5" aria-label="Armazenamento de mídias">
 <div className="flex items-center justify-between gap-4"><h2 className="font-display font-semibold">Seu armazenamento</h2><Button size="sm" variant="outline" onClick={()=>{setOpen(true);void loadFiles();void load().catch(()=>setError(true))}}>Gerenciar</Button></div>
 <p className="my-3 text-sm text-muted-foreground">{error?'Não foi possível consultar o armazenamento.':usage?`${gb(usage.used)} de ${gb(usage.limit)} utilizados da sua cota no aplicativo`:'Consultando armazenamento...'}</p>
 <Progress value={percent} />
 {usage&&<p className="mt-2 text-xs text-muted-foreground">Disponível para novos uploads: {gb(Math.max(0,Math.min(usage.limit-usage.used,usage.globalAvailable)))}.{percent>=85?' Seu armazenamento está próximo do limite.':''}</p>}
 <Sheet open={open} onOpenChange={setOpen}><SheetContent className="w-full overflow-y-auto px-6 py-8 sm:max-w-2xl"><SheetTitle>Gerenciar armazenamento</SheetTitle><SheetDescription className="mt-2">Gerencie sua cota e libere espaço sem acessar a Cloudflare. A capacidade do aplicativo é compartilhada entre as contas e não é o limite de cobrança do R2.</SheetDescription>
 {usage&&<div className="mt-6 space-y-5"><p>Em uso ou reservado: <strong>{gb(usage.used)}</strong></p><p className="text-sm text-muted-foreground">Reservas e exclusões em processamento: {gb(usage.pending)}. O espaço permanece reservado até a expiração dos links de upload.</p><label className="block text-sm">Limite pessoal (MB)<input type="number" min={Math.ceil(usage.used/1e6)} max={usage.maxLimit/1e6} value={limit} onChange={e=>setLimit(e.target.value)} className="mt-2 w-full rounded-md border border-border bg-surface-0 p-2" /></label><Button disabled={saving} onClick={async()=>{setSaving(true);try{const response=await fetch('/api/storage/usage',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({limit:Math.floor(Number(limit)*1e6)})});const data=await response.json();if(!response.ok)throw new Error(data.error);await load();toast.success('Limite atualizado')}catch(e){toast.error(e instanceof Error?e.message:'Não foi possível salvar')}finally{setSaving(false)}}}>{saving?'Salvando...':'Salvar limite'}</Button><p className="text-xs text-muted-foreground">Estes valores controlam uploads do SyncExpress. Não representam a cobrança em GB-mês da Cloudflare nem incluem arquivos antigos do Supabase. Arquivos em uso, favoritos e fixados ficam protegidos contra exclusão por esta tela.</p></div>}
 <div className="mt-8 space-y-4 border-t border-border pt-5">
 <h3 className="font-display text-lg font-semibold">Liberar espaço</h3>
 <p className="text-xs text-muted-foreground">Arquivos maiores aparecem primeiro. A exclusão remove a mídia do armazenamento e não pode ser desfeita. Arquivos das edições precisam ser removidos delas primeiro.</p>
 <input aria-label="Buscar mídia no armazenamento" placeholder="Buscar arquivo ou projeto…" value={search} onChange={e=>setSearch(e.target.value)} className="w-full rounded-md border border-border bg-surface-0 p-2 text-sm"/>
 {filesLoading?<p role="status">Carregando mídias…</p>:filesError?<p role="alert" className="text-destructive">{filesError}</p>:<>
 {files.filter(f=>(f.name+' '+f.project).toLocaleLowerCase().includes(search.toLocaleLowerCase())).map(f=><div key={f.id} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3"><div className="min-w-0"><p className="break-words text-sm font-medium">{f.name}</p><p className="mt-1 text-xs text-muted-foreground">{f.project} · {f.provider} · {(f.bytes/1e6).toFixed(2)} MB</p><p className="mt-1 text-xs text-muted-foreground">{f.reason}</p></div><Button size="sm" variant="outline" disabled={f.protected||deleting!==null} onClick={async()=>{
 if(!await confirmDialog({title:`Excluir “${f.name}”?`,description:'Este arquivo está sem uso nas edições. Ele será removido do armazenamento e da biblioteca. A exclusão não pode ser desfeita.',confirmLabel:'Excluir arquivo',tone:'danger'}))return
 setDeleting(f.id);try{const r=await fetch('/api/storage/files',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:f.id})});const d=await r.json();if(!r.ok)throw Error(d.error);await Promise.all([load(),loadFiles()]);toast.success('Arquivo excluído.',{description:'Se houver uma reserva de upload ativa, o espaço será liberado após o link expirar.'})}catch(e){toast.error(e instanceof Error?e.message:'Falha ao excluir.')}finally{setDeleting(null)}
 }}>{deleting===f.id?'Excluindo…':'Excluir'}</Button></div>)}
 {!files.length&&<p className="text-sm text-muted-foreground">Nenhum arquivo encontrado.</p>}
 </>}
 </div>
 </SheetContent></Sheet></section>
}
