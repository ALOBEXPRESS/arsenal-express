import type { SupabaseClient } from '@supabase/supabase-js'

/** RLS scopes every page to the signed-in account. Never scan the bucket by prefix. */
export async function ownedFiles(db: SupabaseClient) {
  async function pages(table: string, fields: string) {
    const result: any[] = []
    for (let from = 0; ; from += 500) {
      const { data, error } = await db.from(table).select(fields).order('id').range(from, from + 499)
      if (error) throw error
      result.push(...(data || []))
      if (!data || data.length < 500) return result
    }
  }
  const [assets, projects, scenes] = await Promise.all([
    pages('assets', 'id,project_id,library_user_id,filename,kind,file_size_bytes,is_favorite,metadata'),
    pages('projects', 'id,name,config'),
    pages('scenes', 'id,project_id,video_asset_id,image_asset_id,audio_asset_id'),
  ])
  const ids = new Set(assets.map(a => a.id)), used = new Set<string>()
  const visit = (value: unknown) => {
    if (typeof value === 'string' && ids.has(value)) used.add(value)
    else if (Array.isArray(value)) value.forEach(visit)
    else if (value && typeof value === 'object') Object.values(value).forEach(visit)
  }
  for (const scene of scenes) [scene.video_asset_id, scene.image_asset_id, scene.audio_asset_id].forEach(visit)
  for (const project of projects) {
    if (project.config?.archived_into) continue
    const { organization_backup, ...config } = project.config || {}
    visit(config)
  }
  const names = new Map(projects.map(p => [p.id, p.name]))
  return assets.map(a => ({ id: a.id, name: a.filename, kind: a.kind,
    bytes: Number(a.file_size_bytes) || 0, provider: a.metadata?.storage_provider === 'r2' ? 'R2' : 'Supabase',
    project: names.get(a.project_id) || 'Biblioteca compartilhada',
    protected: used.has(a.id) || !!a.is_favorite || !!a.library_user_id,
    reason: used.has(a.id) ? 'Em uso na edição' : a.is_favorite || a.library_user_id ? 'Favorito ou fixado' : 'Sem uso na edição',
  })).sort((a,b) => b.bytes - a.bytes)
}
