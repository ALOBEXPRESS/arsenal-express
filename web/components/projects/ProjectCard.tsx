'use client'

import Link from 'next/link'
import { Trash2, Mic } from 'lucide-react'
import type { Project } from '@/types/project'
import { formatTime } from '@/lib/timeline'
import { confirmDialog } from '@/components/ui/confirm'

interface ProjectCardProps {
  project: Project
  onDelete?: (id: string) => void
}

const statusLabels: Record<string, string> = {
  draft: 'Rascunho',
  in_progress: 'Editando',
  ready: 'Pronto',
  completed: 'Exportado',
}

/** Deterministic uneven "cut" widths from the project id — every card gets its own rhythm */
function rhythm(id: string, n = 9) {
  const vals = Array.from({ length: n }, (_, i) => 2 + (id.charCodeAt(i % id.length) % 7))
  const sum = vals.reduce((a, b) => a + b, 0)
  return vals.map((v) => (v / sum) * 100)
}

export function ProjectCard({ project, onDelete }: ProjectCardProps) {
  const date = new Date(project.updated_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
  const narration = project.settings?.narration_track || []
  const narrationTotal = narration.reduce((a, s) => a + s.duration, 0)

  return (
    <div className="group relative overflow-hidden rounded-xl border border-border bg-surface-1 transition-colors duration-200 hover:border-primary/50">
      <Link href={`/project/${project.id}`} className="block cursor-pointer">
        <div className="grain relative aspect-[16/8] overflow-hidden bg-surface-0 p-4">
          <div className="ruler absolute inset-x-4 top-3 h-3 [--major:48px]" aria-hidden />
          <div className="absolute inset-x-4 top-9 flex h-10 gap-[3px]" aria-hidden>
            {rhythm(project.id).map((w, i) => (
              <span
                key={i}
                className="rounded bg-track-video/70 transition-colors group-hover:bg-track-video"
                style={{ width: `${w}%` }}
              />
            ))}
          </div>
          <div className="absolute inset-x-4 top-[88px] h-5 rounded bg-track-audio/50" aria-hidden />
          <span className="absolute bottom-3 right-4 font-mono text-[11px] tabular-nums text-muted-foreground">
            {narrationTotal > 0 ? formatTime(narrationTotal) : '--:--'}
          </span>
        </div>

        <div className="border-t border-border p-4">
          <div className="flex items-start justify-between gap-3">
            <h3 className="line-clamp-2 font-display text-lg font-bold leading-tight transition-colors group-hover:text-primary">
              {project.title}
            </h3>
            <span className="whitespace-nowrap rounded-full border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {statusLabels[project.status] || project.status}
            </span>
          </div>
          {project.description && <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">{project.description}</p>}
          <div className="mt-3 flex items-center justify-between font-mono text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <Mic className="h-3 w-3" aria-hidden /> {narration.length} narração{narration.length === 1 ? '' : 'ões'}
            </span>
            <span>{date}</span>
          </div>
        </div>
      </Link>

      {onDelete && (
        <button
          onClick={async (e) => {
            e.preventDefault()
            const ok = await confirmDialog({
              title: `Excluir “${project.title}”?`,
              description: 'O projeto, as cenas e as mídias enviadas serão apagados. Isso não pode ser desfeito.',
              confirmLabel: 'Excluir projeto',
              tone: 'danger',
            })
            if (ok) onDelete(project.id)
          }}
          className="absolute right-2 top-2 cursor-pointer rounded-md bg-surface-0/80 p-2 text-muted-foreground opacity-0 backdrop-blur transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
          aria-label={`Excluir ${project.title}`}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
