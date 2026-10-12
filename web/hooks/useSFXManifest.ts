/**
 * Hook to load and cache the Sound Effects manifest
 */
import { useQuery } from '@tanstack/react-query'
import type { SFXManifest } from '@/types/project'

async function fetchManifest(): Promise<SFXManifest> {
  const response = await fetch('/sfx/manifest.json')
  if (!response.ok) {
    throw new Error('Falha ao carregar biblioteca de efeitos')
  }
  return response.json()
}

export function useSFXManifest() {
  return useQuery({
    queryKey: ['sfx-manifest'],
    queryFn: fetchManifest,
    staleTime: 1000 * 60 * 60, // 1 hour (manifest rarely changes)
    gcTime: 1000 * 60 * 60 * 24, // 24 hours
  })
}
