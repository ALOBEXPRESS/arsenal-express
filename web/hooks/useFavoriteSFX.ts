/**
 * Hook to manage favorite sound effects using localStorage
 */
import { useState, useEffect } from 'react'

const STORAGE_KEY = 'syncexpress:favorite-sfx'

export function useFavoriteSFX() {
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set()
    
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      return stored ? new Set(JSON.parse(stored)) : new Set()
    } catch {
      return new Set()
    }
  })

  // Persist to localStorage whenever favorites change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(favorites)))
    } catch (error) {
      console.warn('[useFavoriteSFX] Failed to save favorites:', error)
    }
  }, [favorites])

  const toggleFavorite = (effectId: string) => {
    setFavorites((prev) => {
      const next = new Set(prev)
      if (next.has(effectId)) {
        next.delete(effectId)
      } else {
        next.add(effectId)
      }
      return next
    })
  }

  const isFavorite = (effectId: string) => favorites.has(effectId)

  return {
    favorites: Array.from(favorites),
    isFavorite,
    toggleFavorite,
  }
}
