import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Calls a Postgres function (migration 002). If the function doesn't exist yet
 * (migration not applied), returns `{ missing: true }` so callers can fall back
 * to the legacy multi-request path instead of breaking.
 */
export async function callRpc<T>(
  supabase: SupabaseClient,
  fn: string,
  args: Record<string, unknown>
): Promise<{ data: T | null; missing: boolean }> {
  const { data, error } = await supabase.rpc(fn, args)
  if (!error) return { data: data as T, missing: false }
  // PGRST202 = function not found in schema cache; 42883 = undefined_function
  if (error.code === 'PGRST202' || error.code === '42883') {
    console.warn(`[rpc] ${fn} not available yet — using fallback. Apply supabase/migrations/002.`)
    return { data: null, missing: true }
  }
  throw error
}
