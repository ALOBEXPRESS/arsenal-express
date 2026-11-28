'use client'
import {useEffect,useState} from 'react'
import Link from 'next/link'
import {ArrowLeft,KeyRound,Eye,EyeOff} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {confirmDialog} from '@/components/ui/confirm'
import {toast} from 'sonner'

type Provider='openai'|'google'
type KeyStatus={provider:Provider;last_four:string;updated_at:string}
const providers:{id:Provider;title:string;description:string;url:string}[]=[
 {id:'openai',title:'OpenAI · ChatGPT',description:'Transcrição das falas e geração automática de legendas com Whisper.',url:'https://platform.openai.com/api-keys'},
 {id:'google',title:'Google · Gemini',description:'Gera a voz das cenas na faixa de narração da sequência.',url:'https://aistudio.google.com/api-keys'},
]
export default function ApiKeysPage(){
 const [keys,setKeys]=useState<KeyStatus[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[serverAvailable,setServerAvailable]=useState(false)
 const [values,setValues]=useState<Record<Provider,string>>({openai:'',google:''}),[visible,setVisible]=useState<Record<Provider,boolean>>({openai:false,google:false}),[busy,setBusy]=useState<Provider|null>(null)
 async function load(){
   const response=await fetch('/api/settings/api-keys',{cache:'no-store'}),data=await response.json()
   if(!response.ok)throw Error(data.error||'Não foi possível carregar as configurações.')
   setKeys(data.keys);setServerAvailable(data.serverOpenAIAvailable);setError('')
 }
 useEffect(()=>{void load().catch(e=>setError(e.message)).finally(()=>setLoading(false))},[])
 const save=async(provider:Provider,remove=false)=>{
   if(remove&&!await confirmDialog({title:'Remover esta chave?',description:'A chave será apagada do SyncExpress. Isso não revoga a chave na conta do provedor.',confirmLabel:'Remover chave',tone:'danger'}))return
   setBusy(provider)
   try{
     const response=await fetch('/api/settings/api-keys',{method:remove?'DELETE':'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider,...(!remove?{key:values[provider].trim()}: {})})})
     const data=await response.json();if(!response.ok)throw Error(data.error)
     setValues(old=>({...old,[provider]:''}));setVisible(old=>({...old,[provider]:false}));await load()
     toast.success(remove?'Chave removida.':'Chave salva com segurança.')
   }catch(e){toast.error(e instanceof Error?e.message:'Não foi possível salvar a chave.')}
   finally{setBusy(null)}
 }
 return <div className="mx-auto max-w-3xl space-y-6">
   <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary"><ArrowLeft className="h-4 w-4"/>Voltar aos projetos</Link>
   <header><p className="eyebrow">Configurações da conta</p><h1 className="mt-2 font-display text-3xl font-bold">Suas chaves de API</h1><p className="mt-3 text-muted-foreground">Conecte suas contas para usar os serviços de inteligência artificial em todos os seus projetos.</p></header>
   {error&&<div role="alert" className="rounded-lg border border-destructive p-4 text-sm"><p>{error}</p><Button variant="outline" className="mt-3" onClick={()=>{setLoading(true);void load().catch(e=>setError(e.message)).finally(()=>setLoading(false))}}>Tentar novamente</Button></div>}
   {providers.map(provider=>{const saved=keys.find(k=>k.provider===provider.id);return <section key={provider.id} className="space-y-4 rounded-xl border border-border bg-surface-1 p-5">
     <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 font-display text-xl font-semibold"><KeyRound className="h-5 w-5 text-primary"/>{provider.title}</h2><span className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">{loading?'Carregando…':saved?'Chave configurada':'Não configurada'}</span></div>
     <p className="text-sm text-muted-foreground">{provider.description}</p>
     {saved&&<p className="font-mono text-xs text-muted-foreground">Chave salva: ••••{saved.last_four} · Atualizada em {new Date(saved.updated_at).toLocaleDateString('pt-BR')}</p>}
     {provider.id==='openai'&&serverAvailable&&!saved&&<p className="text-xs text-muted-foreground">Sua conta de administrador está usando a chave padrão do servidor. Ao salvar uma chave pessoal, ela terá prioridade.</p>}
     <form onSubmit={e=>{e.preventDefault();void save(provider.id)}} className="space-y-3">
       <label htmlFor={`key-${provider.id}`} className="block text-sm font-medium">{saved?'Nova chave para substituir a atual':'Chave de API'}</label>
       <div className="flex gap-2"><input id={`key-${provider.id}`} type={visible[provider.id]?'text':'password'} autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={1024} value={values[provider.id]} onChange={e=>setValues(old=>({...old,[provider.id]:e.target.value}))} placeholder={saved?'Cole uma nova chave para substituir':'Cole sua chave aqui'} disabled={loading||busy!==null||!!error} className="min-w-0 flex-1 rounded-md border border-border bg-surface-0 px-3 py-2 text-sm"/><Button type="button" variant="outline" size="icon" aria-label={visible[provider.id]?'Ocultar chave digitada':'Mostrar chave digitada'} onClick={()=>setVisible(old=>({...old,[provider.id]:!old[provider.id]}))}>{visible[provider.id]?<EyeOff/>:<Eye/>}</Button></div>
       <div className="flex flex-wrap items-center gap-3"><Button type="submit" disabled={loading||busy!==null||values[provider.id].trim().length<20||!!error}>{busy===provider.id?'Salvando…':saved?'Substituir chave':'Salvar chave'}</Button>{saved&&<Button type="button" variant="ghost" disabled={busy!==null||!!error} onClick={()=>void save(provider.id,true)}>Remover chave</Button>}<a className="text-sm text-primary underline underline-offset-4" href={provider.url} target="_blank" rel="noopener noreferrer">Obter chave no provedor ↗</a></div>
     </form>
   </section>})}
   <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">As chaves ficam criptografadas e vinculadas somente à sua conta. Depois de salvas, não são exibidas por completo. O uso e as cotas das APIs são administrados pelas suas contas nos provedores.</p>
 </div>
}
