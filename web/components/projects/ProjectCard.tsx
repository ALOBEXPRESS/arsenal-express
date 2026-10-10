'use client'

import Link from 'next/link'
import type { Project } from '@/types/project'
import { cn } from '@/lib/utils'

interface ProjectCardProps {
  project: Project
  onDelete?: (id: string) => void
}

const statusColors = {
  draft: 'bg-gray-500',
  in_progress: 'bg-blue-500',
  ready: 'bg-yellow-500',
  completed: 'bg-green-500',
}

const statusLabels = {
  draft: 'Draft',
  in_progress: 'In Progress',
  ready: 'Ready',
  completed: 'Completed',
}

const modeLabels = {
  upload: 'Upload Mode',
  'script-to-prompt': 'Script to Prompt',
}

export function ProjectCard({ project, onDelete }: ProjectCardProps) {
  const formattedDate = new Date(project.updated_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  return (
    <div className="group relative overflow-hidden rounded-lg border border-gray-800 bg-gray-900 transition-all hover:border-gray-700 hover:shadow-lg">
      <Link href={`/project/${project.id}`} className="block">
        {/* Thumbnail placeholder */}
        <div className="aspect-video w-full bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center">
          <div className="text-6xl">🎬</div>
        </div>

        {/* Content */}
        <div className="p-4">
          <div className="flex items-start justify-between gap-2 mb-2">
            <h3 className="font-semibold text-lg line-clamp-2 group-hover:text-blue-400 transition-colors">
              {project.title}
            </h3>
            <span
              className={cn(
                'px-2 py-1 rounded text-xs font-medium text-white whitespace-nowrap',
                statusColors[project.status]
              )}
            >
              {statusLabels[project.status]}
            </span>
          </div>

          {project.description && (
            <p className="text-sm text-gray-400 line-clamp-2 mb-3">
              {project.description}
            </p>
          )}

          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>{modeLabels[project.mode]}</span>
            <span>{formattedDate}</span>
          </div>
        </div>
      </Link>

      {/* Delete button */}
      {onDelete && (
        <button
          onClick={(e) => {
            e.preventDefault()
            if (confirm('Are you sure you want to delete this project?')) {
              onDelete(project.id)
            }
          }}
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-red-500 hover:bg-red-600 text-white p-2 rounded-md"
          title="Delete project"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </button>
      )}
    </div>
  )
}
