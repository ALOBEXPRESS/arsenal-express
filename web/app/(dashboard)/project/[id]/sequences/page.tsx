"use client"
import {use,useState} from 'react'
import Link from 'next/link'
import {useRouter} from 'next/navigation'
import {useQueryClient} from '@tanstack/react-query'
import {useProject} from '@/lib/hooks/useProjects'
import {useScenes,patchProjectConfig} from '@/lib/hooks/useScenes'
import {emptySub,getSubprojects,scenesOf,MAIN_SUB} from '@/lib/subprojects'
import {Button} from '@/components/ui/button'
import {Plus,ArrowLeft,Film,ArrowUpRight,Library} from 'lucide-react'
import {toast} from 'sonner'
export default function SequencesPage({params}:{params:Promise<{id:string}>}){
 const {id}=use(params),router=useRouter(),cache=useQueryClient(),{data:project,isLoading,error}=useProject(id),{data:scenes=[]}=useScenes(id)
 const [name,setName]=useState(''),[busy,setBusy]=useState(false),[query,setQuery]=useState('')
 if(isLoading)return <p className="p-8 text-muted-foreground">Carregando sequências…</p>
 if(error||!project)return <p role="alert">Não foi possível carregar o projeto.</p>
 if(project.settings?.archived_into)return <Link href={`/project/${project.settings.archived_into}/sequences`}>Abrir projeto reorganizado →</Link>
 const sequences=project.settings?.sequence_creation_required?[]:getSubprojects(project.settings)
 const create=async(e:React.FormEvent)=>{
 e.preventDefault();if(busy)return;setBusy(true)
 try{const next=emptySub(sequences.length?crypto.randomUUID():MAIN_SUB,sequences.length);next.name=name.trim()||`Sequência ${sequences.length+1}`
 await patchProjectConfig(id,{sequence_creation_required:false,subprojects:[...sequences,next]})
 await cache.invalidateQueries({queryKey:['project',id]});void cache.invalidateQueries({queryKey:['projects']})
 localStorage.setItem(`syncexpress.sub.${id}`,next.id);router.push(`/project/${id}?sequence=${encodeURIComponent(next.id)}`)
 }catch(e){toast.error(e instanceof Error?e.message:'Não foi possível criar a sequência.')}finally{setBusy(false)}
 }
 return <div className="space-y-8 animate-rise-in">
 <Link className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary" href="/dashboard"><ArrowLeft className="h-4 w-4"/> Todos os projetos</Link>
 <header className="grid gap-6 border-b border-border pb-7 md:grid-cols-[1fr_auto]"><div><p className="eyebrow">Projeto / sequências</p><h1 className="mt-2 font-display text-4xl font-bold">{project.title}</h1><p className="mt-3 max-w-xl text-muted-foreground">Cada sequência é uma edição independente. Escolha um episódio ou comece uma nova montagem.</p></div><div className="self-end rounded-xl border border-border bg-surface-1 px-6 py-4"><span className="font-mono text-3xl text-primary">{String(sequences.length).padStart(2,'0')}</span><p className="mt-1 text-xs text-muted-foreground">sequências neste projeto</p></div></header>
 <form onSubmit={create} className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface-1 p-5"><label className="min-w-48 flex-1 text-sm font-medium">Nova sequência<input maxLength={100} value={name} onChange={e=>setName(e.target.value)} className="mt-2 block w-full rounded-md border border-border bg-surface-0 px-3 py-2" placeholder="Ex.: Episódio 08"/></label><Button disabled={busy}><Plus/>{busy?'Criando…':'Criar sequência'}</Button></form>
 <div className="flex flex-wrap items-center justify-between gap-4"><h2 className="font-display text-xl font-semibold">Suas sequências</h2><input aria-label="Buscar sequência" className="rounded-md border border-border bg-surface-1 px-3 py-2 text-sm" placeholder="Buscar por nome…" value={query} onChange={e=>setQuery(e.target.value)}/></div>
 <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{sequences.filter(s=>s.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map((s,i)=>{const count=scenesOf(scenes,s.id,new Set(sequences.map(s=>s.id))).length;return <Link key={s.id} href={`/project/${id}?sequence=${encodeURIComponent(s.id)}`} className="group rounded-xl border border-border bg-surface-1 p-5 transition-colors hover:border-primary/60"><div className="mb-7 flex items-center justify-between"><span className="font-mono text-xs text-primary">SEQUÊNCIA {String(i+1).padStart(2,'0')}</span><ArrowUpRight className="h-5 w-5 text-muted-foreground group-hover:text-primary"/></div><Film className="mb-3 h-6 w-6 text-track-video"/><h3 className="font-display text-lg font-bold">{s.name}</h3><p className="mt-2 text-xs text-muted-foreground">{count} cenas · {s.narration_track.length} trechos de narração</p><div className="mt-5 flex gap-1" aria-hidden>{Array.from({length:Math.min(12,Math.max(1,count))},(_,j)=><span key={j} className="h-2 flex-1 rounded-sm bg-track-video/60"/>)}</div></Link>})}</div>
 {!sequences.length&&<div className="rounded-xl border border-dashed border-border p-10 text-center"><Film className="mx-auto mb-3 h-8 w-8 text-primary"/><h2 className="font-display text-xl font-bold">Seu projeto está pronto para começar</h2><p className="mt-2 text-muted-foreground">Crie a primeira sequência acima e adicione seus clipes.</p></div>}
 <footer className="flex items-start gap-3 rounded-xl border border-border p-5 text-sm text-muted-foreground"><Library className="h-5 w-5 shrink-0 text-primary"/><p>Sua biblioteca acompanha você: áudios fixados, assets extras e imagens favoritas ficam disponíveis em todos os projetos da conta.</p></footer>
 </div>
}
