import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { storageAdmin } from '@/lib/storage/admin'
import { cleanupStorage } from '@/lib/storage/cleanup'
import { signR2Upload } from '@/lib/storage/r2'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try {
    const body = await request.json()
    if (typeof body.projectId !== 'string' || !Number.isSafeInteger(body.size) || body.size <= 0 || body.size > 500000000 || typeof body.contentType !== 'string' || body.contentType.length > 150) return NextResponse.json({ error: 'Arquivo inválido' }, { status: 400 })
    const { data: project } = await supabase.from('projects').select('id').eq('id', body.projectId).eq('user_id', user.id).single()
    if (!project) return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })
    await cleanupStorage()
    const admin = storageAdmin()
    const { data: reservation, error } = await admin.rpc('reserve_media_storage', { p_user_id: user.id, p_project_id: project.id, p_size_bytes: body.size })
    if (error) return NextResponse.json({ error: error.message.includes('limite') || error.message.includes('Limite') ? 'Limite de armazenamento atingido. Libere espaço para continuar.' : 'Não foi possível reservar espaço para o arquivo.' }, { status: 409 })
    try {
      const url = await signR2Upload(reservation.object_key, body.contentType, body.size)
      return NextResponse.json({ reservationId: reservation.id, url, key: reservation.object_key }, { headers: { 'Cache-Control': 'private, no-store' } })
    } catch {
      // No upload URL has been issued, so no object can exist for this reservation.
      await admin.from('media_storage_reservations').delete().eq('id', reservation.id)
      throw new Error('Falha ao autorizar upload')
    }
  } catch { return NextResponse.json({ error: 'Não foi possível preparar o upload.' }, { status: 503 }) }
}
