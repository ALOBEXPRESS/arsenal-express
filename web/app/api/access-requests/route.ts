import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
export async function POST(request: Request) {
 if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({error:'Origem inválida.'},{status:403})
 const input=z.discriminatedUnion('action',[
 z.object({action:z.literal('submit'),email:z.string().trim().email().max(254),name:z.string().trim().min(2).max(100)}),
 z.object({action:z.literal('status'),id:z.string().uuid()})
 ]).safeParse(await request.json().catch(()=>null))
 if(!input.success) return NextResponse.json({error:'Confira os dados informados.'},{status:400})
 const client=await createClient()
 const {data,error}=input.data.action==='submit'
 ? await client.rpc('submit_access_request',{p_email:input.data.email,p_name:input.data.name})
 : await client.rpc('access_request_status',{p_id:input.data.id})
 if(error) return NextResponse.json({error:input.data.action==='submit'?'Não foi possível enviar. Se já enviou um pedido, consulte seu código ou aguarde uma hora para tentar novamente.':'Consulta indisponível. Tente novamente.'},{status:400})
 return NextResponse.json(input.data.action==='submit'?{id:data}:{status:data},{headers:{'Cache-Control':'no-store'}})
}
