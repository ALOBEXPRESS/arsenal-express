'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

/** Current user's recorded media size; independent of the R2 billing calculation. */
export function StorageSummary() {
  const [usage, setUsage] = useState<number | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let active = true
    const load = async () => {
      const supabase = createClient()
      const { data: projects, error: projectError } = await supabase.from('projects').select('id')
      if (projectError) throw projectError
      const ids = (projects || []).map(p => p.id)
      if (!ids.length) return 0
      let total = 0
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await supabase.from('assets').select('file_size_bytes').in('project_id', ids).range(offset, offset + 499)
        if (error) throw error
        for (const asset of data || []) total += Number(asset.file_size_bytes) || 0
        if (!data || data.length < 500) break
      }
      return total
    }
    load().then(value => { if (active) setUsage(value) }).catch(() => { if (active) setFailed(true) })
    return () => { active = false }
  }, [])
  return <section className="mb-6 rounded-xl border border-border bg-surface-1 p-5" aria-label="Armazenamento de mídias">
    <h2 className="font-display font-semibold">Seu armazenamento de mídias</h2>
    <p className="mt-2 text-sm text-muted-foreground">{failed ? 'Não foi possível carregar o uso agora.' : usage === null ? 'Calculando...' : `${(usage / 1_000_000_000).toFixed(2)} GB em arquivos registrados nos seus projetos`}</p>
    <p className="mt-1 text-xs text-muted-foreground">Estimativa baseada nos arquivos registrados. Não representa a cobrança da Cloudflare nem inclui arquivos sem tamanho informado.</p>
  </section>
}
