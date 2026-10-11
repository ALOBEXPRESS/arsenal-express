'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { ProjectList } from '@/components/projects/ProjectList'
import { NewProjectModal } from '@/components/projects/NewProjectModal'
import { Button } from '@/components/ui/button'

export default function DashboardPage() {
  const [showNewProjectModal, setShowNewProjectModal] = useState(false)

  return (
    <div className="animate-rise-in">
      <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow flex items-center gap-2">
            <span className="tally" aria-hidden /> SyncExpress
          </p>
          <h1 className="mt-3 font-display text-4xl font-extrabold tracking-tight">Seus projetos</h1>
          <p className="mt-1 text-muted-foreground">Cada projeto vira uma timeline pronta pro CapCut.</p>
        </div>
        <Button size="lg" onClick={() => setShowNewProjectModal(true)}>
          <Plus /> Novo projeto
        </Button>
      </div>

      <ProjectList />

      <NewProjectModal open={showNewProjectModal} onOpenChange={setShowNewProjectModal} />
    </div>
  )
}
