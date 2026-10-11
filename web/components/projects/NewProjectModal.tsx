'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, ScanLine, Smartphone, Monitor, Square } from 'lucide-react'
import { useCreateProject } from '@/lib/hooks/useProjects'
import type { OutputFormat } from '@/types/project'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface NewProjectModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const FORMATS: { value: OutputFormat; label: string; hint: string; icon: React.ReactNode; frame: string }[] = [
  { value: 'auto', label: 'Auto', hint: 'Segue os clipes', icon: <ScanLine className="h-4 w-4" />, frame: 'h-7 w-7 border-dashed' },
  { value: '9:16', label: '9:16', hint: 'Shorts · Reels · TikTok', icon: <Smartphone className="h-4 w-4" />, frame: 'h-8 w-[18px]' },
  { value: '16:9', label: '16:9', hint: 'YouTube', icon: <Monitor className="h-4 w-4" />, frame: 'h-[18px] w-8' },
  { value: '1:1', label: '1:1', hint: 'Feed', icon: <Square className="h-4 w-4" />, frame: 'h-6 w-6' },
]

export function NewProjectModal({ open, onOpenChange }: NewProjectModalProps) {
  const router = useRouter()
  const createProject = useCreateProject()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [format, setFormat] = useState<OutputFormat>('auto')
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (title.trim().length < 3) {
      setError('Dê um nome com pelo menos 3 letras.')
      return
    }
    setError(null)
    try {
      const project = await createProject.mutateAsync({
        title: title.trim(),
        description: description.trim() || undefined,
        mode: 'upload',
        settings: { output_format: format, default_transition: 'dissolve', fps: 30 },
      })
      setTitle('')
      setDescription('')
      onOpenChange(false)
      router.push(`/project/${project.id}`)
    } catch {
      /* hook shows the error */
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(92vw,500px)]">
        <DialogHeader>
          <p className="eyebrow flex items-center gap-2">
            <span className="tally" aria-hidden /> Novo projeto
          </p>
          <DialogTitle className="font-display text-2xl">Qual vídeo vamos montar?</DialogTitle>
          <DialogDescription>Depois você sobe os clipes + narração e o SyncExpress faz o resto.</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="mt-5 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="np-title">Nome</Label>
            <Input id="np-title" autoFocus placeholder="ex: Vice City — episódio 12" value={title} onChange={(e) => setTitle(e.target.value)} />
            {error && <p className="text-[12px] text-destructive">{error}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="np-desc">
              Descrição <span className="text-muted-foreground">(opcional)</span>
            </Label>
            <Textarea id="np-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">Formato do vídeo</legend>
            <div role="radiogroup" className="grid grid-cols-4 gap-2">
              {FORMATS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  role="radio"
                  aria-checked={format === f.value}
                  onClick={() => setFormat(f.value)}
                  className={cn(
                    'flex cursor-pointer flex-col items-center gap-2 rounded-lg border px-2 py-3 transition-colors duration-200',
                    format === f.value ? 'border-primary bg-primary/[0.07] text-primary' : 'border-border text-muted-foreground hover:border-foreground/25'
                  )}
                >
                  <span className="flex h-9 items-center" aria-hidden>
                    <span className={cn('rounded-[3px] border-2 border-current', f.frame)} />
                  </span>
                  <span className="text-[13px] font-semibold">{f.label}</span>
                  <span className="text-center text-[10px] leading-tight opacity-80">{f.hint}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={createProject.isPending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={createProject.isPending} className="font-semibold">
              {createProject.isPending && <Loader2 className="animate-spin" />} Criar projeto
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
