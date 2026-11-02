import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { storageAdmin } from '@/lib/storage/admin'
import { cleanupStorage } from '@/lib/storage/cleanup'

async function user() { const db=await createClient(); const {data:{user}}=await db.auth.getUser(); return user }
export async function GET() {
  const current=await user(); if(!current) return NextResponse.json({error:'Não autenticado'},{status:401})
  try {
    await cleanupStorage()
    const {data,error}=await storageAdmin().rpc('media_storage_usage',{p_user_id:current.id}); if(error) throw error
    return NextResponse.json(data,{headers:{'Cache-Control':'private, no-store'}})
  } catch {return NextResponse.json({error:'Não foi possível consultar o armazenamento.'},{status:503})}
}
export async function PATCH(request:Request) {
  const current=await user(); if(!current) return NextResponse.json({error:'Não autenticado'},{status:401})
  try {
    const {limit}=await request.json(); const admin=storageAdmin()
    const {data:usage,error}=await admin.rpc('media_storage_usage',{p_user_id:current.id}); if(error) throw error
    if(!Number.isSafeInteger(limit)||limit<usage.used||limit>usage.maxLimit) return NextResponse.json({error:'Escolha um limite entre o espaço utilizado e a cota da conta.'},{status:400})
    const {error:write}=await admin.from('media_storage_user_limits').upsert({user_id:current.id,limit_bytes:limit}); if(write) throw write
    return NextResponse.json({ok:true})
  } catch {return NextResponse.json({error:'Não foi possível salvar o limite.'},{status:503})}
}
