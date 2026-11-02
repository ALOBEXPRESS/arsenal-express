import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { storageAdmin } from '@/lib/storage/admin'
import { deleteR2Object } from '@/lib/storage/r2'

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  const { id } = await params
  const { data: asset } = await supabase.from('assets').select('id, project_id, storage_path, metadata').eq('id', id).single()
  if (!asset) return NextResponse.json({ error: 'Mídia não encontrada' }, { status: 404 })
  const { data: project } = await supabase.from('projects').select('id').eq('id', asset.project_id).eq('user_id', user.id).single()
  if (!project) return NextResponse.json({ error: 'Mídia não encontrada' }, { status: 404 })
  try {
    if (asset.metadata?.storage_provider === 'r2') {
      const admin=storageAdmin()
      const {data:reservation}=await admin.from('media_storage_reservations').select('id,object_key,expires_at').eq('asset_id',id).eq('user_id',user.id).single()
      if(!reservation) throw new Error('Mídia sem reserva autorizada')
      await deleteR2Object(reservation.object_key)
      const {error}=await admin.from('media_storage_reservations').update({state:'deleting'}).eq('id',reservation.id)
      if(error) throw error
    }
    else {
      const { error } = await supabase.storage.from('media').remove([asset.storage_path])
      if (error) throw error
    }
    const { error } = await supabase.from('assets').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch { return NextResponse.json({ error: 'Não foi possível remover a mídia.' }, { status: 503 }) }
}
