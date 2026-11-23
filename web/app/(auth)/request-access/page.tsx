"use client"
import { useState } from 'react'
import Link from 'next/link'
export default function RequestAccessPage(){
 const [name,setName]=useState(''),[email,setEmail]=useState(''),[id,setId]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false)
 async function send(action:'submit'|'status'){
 setBusy(true);setMessage('')
 try{
 const response=await fetch('/api/access-requests',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(action==='submit'?{action,name,email}:{action,id})})
 const data=await response.json();if(!response.ok)throw new Error(data.error)
 if(action==='submit'){setId(data.id);setMessage('Pedido enviado! Guarde o código abaixo para acompanhar a resposta. A aprovação não cria sua conta automaticamente.')}
 else setMessage(data.status==='approved'?'Aprovado! Crie sua conta com o mesmo e-mail, confirme o endereço e entre.':data.status==='pending'?'Seu pedido está pendente de análise.':data.status==='rejected'?'Seu pedido foi recusado.':'Pedido não encontrado. Confira o código.')
 }catch(e){setMessage(e instanceof Error?e.message:'Não foi possível concluir. Tente novamente.')}finally{setBusy(false)}
 }
 const field='block w-full rounded-md border border-border bg-input px-3 py-2'
 return <div className="space-y-6"><h1 className="text-2xl font-bold">Solicitar acesso</h1><p className="text-sm text-muted-foreground">Envie seu pedido ao administrador aqui mesmo. Você poderá criar sua conta após a aprovação.</p>
 <form className="space-y-4" onSubmit={e=>{e.preventDefault();void send('submit')}}>
 <label className="block text-sm">Nome<input className={field} autoComplete="name" required minLength={2} maxLength={100} value={name} onChange={e=>setName(e.target.value)}/></label>
 <label className="block text-sm">E-mail que usará na conta<input className={field} type="email" autoComplete="email" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)}/></label>
 <button disabled={busy} className="w-full rounded-md bg-primary-fill p-3 font-semibold text-primary-foreground disabled:opacity-50">{busy?'Aguarde…':'Enviar solicitação'}</button></form>
 {message&&<p role="status" className="rounded-md border border-border p-3 text-sm">{message}</p>}
 <form className="space-y-3 border-t border-border pt-5" onSubmit={e=>{e.preventDefault();void send('status')}}><h2 className="font-semibold">Consultar solicitação</h2><label className="block text-sm">Código do pedido<input className={field} required value={id} onChange={e=>setId(e.target.value.trim())}/></label><p className="text-xs text-muted-foreground">Guarde este código. Ele permite consultar seu pedido em qualquer dispositivo.</p><button disabled={busy} className="w-full rounded-md border border-border p-3 disabled:opacity-50">Consultar pedido</button></form>
 <div className="flex justify-between text-sm text-primary"><Link href="/login">Voltar ao login</Link><Link href="/signup">Já fui aprovado: criar conta</Link></div></div>
}
