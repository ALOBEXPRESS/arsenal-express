import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ownedFiles } from '@/lib/storage/ownedFiles'
import { DELETE as deleteMedia } from '@/app/api/media/[id]/route'

async function account() {
  const db = await createClient()
  const {data:{user}} = await db.auth.getUser()
  if (!user) return null
  const {data,error} = await db.rpc('system_access_status')
  return !error && data?.allowed ? db : null
}
export async function GET() {
  const db = await account()
  if (!db) return NextResponse.json({error:'Acesso não autorizado.'},{status:401})
  try { return NextResponse.json({files:await ownedFiles(db)},{headers:{'Cache-Control':'private, no-store'}}) }
  catch { return NextResponse.json({error:'Não foi possível listar as mídias.'},{status:503}) }
}
export async function DELETE(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({error:'Origem inválida.'},{status:403})
  const db = await account()
  if (!db) return NextResponse.json({error:'Acesso não autorizado.'},{status:401})
  try {
    const {id} = await request.json()
    const file = (await ownedFiles(db)).find(f => f.id === id)
    if (!file) return NextResponse.json({error:'Arquivo não encontrado.'},{status:404})
    if (file.protected) return NextResponse.json({error:'Remova primeiro o arquivo das edições e dos favoritos. Áudios fixados precisam ser desafixados na biblioteca.'},{status:409})
    return deleteMedia(request,{params:Promise.resolve({id:file.id})})
  } catch { return NextResponse.json({error:'Não foi possível excluir o arquivo.'},{status:503}) }
}
