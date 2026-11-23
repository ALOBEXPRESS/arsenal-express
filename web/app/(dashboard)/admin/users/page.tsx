import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AccessAllowlist } from '@/components/admin/AccessAllowlist'

export default async function UserAccessPage() {
  const client = await createClient()
  const { data, error } = await client.rpc('system_access_status')
  if (error || !data?.isAdmin) redirect('/dashboard')
  return <AccessAllowlist />
}
