import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { storageAdmin } from '@/lib/storage/admin'
import { statR2Object } from '@/lib/storage/r2'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try {
    const body = await request.json()
    const admin = storageAdmin()
    const { data: reservation } = await admin.from('media_storage_reservations').select('*').eq('id', body.reservationId).eq('user_id', user.id).single()
    if (!reservation) return NextResponse.json({ error: 'Upload não encontrado' }, { status: 404 })
    const { data: project } = await supabase.from('projects').select('id').eq('id', reservation.project_id).eq('user_id', user.id).single()
    if (!project) return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })
    const object = await statR2Object(reservation.object_key)
    if (object.ContentLength !== reservation.size_bytes) return NextResponse.json({ error: 'O tamanho do arquivo não corresponde ao upload autorizado.' }, { status: 409 })
    const { data, error } = await admin.rpc('complete_media_storage', { p_reservation_id: reservation.id, p_user_id: user.id, p_asset: body.asset })
    if (error) throw error
    return NextResponse.json(data)
  } catch { return NextResponse.json({ error: 'Não foi possível concluir o upload.' }, { status: 503 }) }
}
