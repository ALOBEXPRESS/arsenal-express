import 'server-only'
import { storageAdmin } from './admin'
import { deleteR2Object } from './r2'

export async function cleanupStorage() {
  const admin = storageAdmin()
  const { data, error } = await admin.from('media_storage_reservations').select('id,object_key').in('state', ['pending', 'deleting']).lt('expires_at', new Date().toISOString()).limit(30)
  if (error) throw error
  for (const row of data || []) {
    await deleteR2Object(row.object_key)
    const { error } = await admin.from('media_storage_reservations').delete().eq('id',row.id).in('state',['pending','deleting'])
    if (error) throw error
  }
}
