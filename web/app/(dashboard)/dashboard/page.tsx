'use client'

import { useState } from 'react'
import { ProjectList } from '@/components/projects/ProjectList'
import { NewProjectModal } from '@/components/projects/NewProjectModal'
import { Button } from '@/components/ui/button'

export default function DashboardPage() {
  const [showNewProjectModal, setShowNewProjectModal] = useState(false)

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">My Projects</h1>
          <p className="text-gray-400">Create and manage your video projects</p>
        </div>
        <Button onClick={() => setShowNewProjectModal(true)}>
          <svg
            className="w-5 h-5 mr-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          New Project
        </Button>
      </div>

      {/* Project List */}
      <ProjectList />

      {/* New Project Modal */}
      <NewProjectModal
        open={showNewProjectModal}
        onOpenChange={setShowNewProjectModal}
      />
    </div>
  )
}
