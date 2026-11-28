import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { storageAdmin } from '@/lib/storage/admin'
import { cleanupStorage } from '@/lib/storage/cleanup'

async function user() {
  const db=await createClient(); const {data:{user}}=await db.auth.getUser()
  if(!user)return null
  const {data,error}=await db.rpc('system_access_status')
  return !error && data?.allowed ? {...user,isAdmin:!!data.isAdmin} : null
}
async function usageFor(current: {id:string;isAdmin:boolean}) {
  const admin=storageAdmin()
  let adminMax:number|undefined
  if(current.isAdmin){
    const {data:config,error}=await admin.from('media_storage_limits').select('limit_bytes').eq('scope','global').single()
    if(error)throw error
    adminMax=Number(config.limit_bytes)
    // Only initialize the administrator's quota; preserve explicit personal choices.
    const {error:write}=await admin.from('media_storage_user_limits').upsert({user_id:current.id,limit_bytes:adminMax},{onConflict:'user_id',ignoreDuplicates:true})
    if(write)throw write
  }
  const {data,error}=await admin.rpc('media_storage_usage',{p_user_id:current.id});if(error)throw error
  return {...data,maxLimit:adminMax??data.maxLimit,capacitySource:'application',isAdmin:current.isAdmin}
}
export async function GET() {
  const current=await user(); if(!current) return NextResponse.json({error:'Não autenticado'},{status:401})
  try {
    await cleanupStorage()
    const data=await usageFor(current)
    return NextResponse.json(data,{headers:{'Cache-Control':'private, no-store'}})
  } catch {return NextResponse.json({error:'Não foi possível consultar o armazenamento.'},{status:503})}
}
export async function PATCH(request:Request) {
  if(request.headers.get('origin')!==new URL(request.url).origin)return NextResponse.json({error:'Origem inválida'},{status:403})
  const current=await user(); if(!current) return NextResponse.json({error:'Não autenticado'},{status:401})
  try {
    const {limit}=await request.json(); const admin=storageAdmin()
    const usage=await usageFor(current)
    if(!Number.isSafeInteger(limit)||limit<usage.used||limit>usage.maxLimit) return NextResponse.json({error:'Escolha um limite entre o espaço utilizado e a cota da conta.'},{status:400})
    const {error:write}=await admin.from('media_storage_user_limits').upsert({user_id:current.id,limit_bytes:limit}); if(write) throw write
    return NextResponse.json({ok:true})
  } catch {return NextResponse.json({error:'Não foi possível salvar o limite.'},{status:503})}
}
