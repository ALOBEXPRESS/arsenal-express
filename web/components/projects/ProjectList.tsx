'use client'

import { useState } from 'react'
import { useProjects, useDeleteProject } from '@/lib/hooks/useProjects'
import { ProjectCard } from './ProjectCard'
import { Button } from '@/components/ui/button'

export function ProjectList() {
  const { data: projects, isLoading, error } = useProjects()
  const deleteProject = useDeleteProject()
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    try {
      await deleteProject.mutateAsync(id)
    } catch (error) {
      console.error('Failed to delete project:', error)
      alert('Falha ao excluir o projeto. Tente novamente.')
    } finally {
      setDeletingId(null)
    }
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="aspect-[16/11] rounded-xl bg-surface-1 animate-pulse"
          />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-destructive">Não foi possível carregar os projetos</p>
        <Button
          variant="outline"
          onClick={() => window.location.reload()}
          className="mt-4"
        >
          Tentar de novo
        </Button>
      </div>
    )
  }

  if (!projects || projects.length === 0) {
    return (
      <div className="grain rounded-xl border border-dashed border-border bg-surface-1 py-16 text-center">
        <span className="tally" aria-hidden />
        <h3 className="mt-4 font-display text-xl font-bold">Nenhum projeto ainda</h3>
        <p className="mt-1 text-muted-foreground">Crie o primeiro e suba seus clipes + narração.</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {projects.map((project) => (
        <ProjectCard
          key={project.id}
          project={project}
          onDelete={deletingId === project.id ? undefined : handleDelete}
        />
      ))}
    </div>
  )
}
