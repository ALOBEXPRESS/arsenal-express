import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { storageAdmin } from '@/lib/storage/admin'
import { signR2Read } from '@/lib/storage/r2'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  const { id } = await params
  const { data: asset, error } = await supabase.from('assets').select('project_id, storage_path, metadata').eq('id', id).single()
  if (error || !asset) return NextResponse.json({ error: 'Mídia não encontrada' }, { status: 404 })
  const { data: project } = await supabase.from('projects').select('id').eq('id', asset.project_id).eq('user_id', user.id).single()
  if (!project) return NextResponse.json({ error: 'Mídia não encontrada' }, { status: 404 })
  try {
    let url: string
    if (asset.metadata?.storage_provider === 'r2') {
      const {data:reservation}=await storageAdmin().from('media_storage_reservations').select('object_key').eq('asset_id',id).eq('user_id',user.id).eq('state','complete').single()
      if(!reservation) throw new Error('Mídia não autorizada')
      url = await signR2Read(reservation.object_key)
    }
    else {
      const { data, error } = await supabase.storage.from('media').createSignedUrl(asset.storage_path, 900)
      if (error || !data) throw new Error('Falha ao acessar arquivo')
      url = data.signedUrl
    }
    return NextResponse.json({ url }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch { return NextResponse.json({ error: 'Não foi possível acessar a mídia.' }, { status: 503 }) }
}
