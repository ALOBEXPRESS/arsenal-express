import type { Asset } from '@/types/project'
import { withDefaults, type SyncSettings } from './presets'

/** Opening defaults never rebuild an existing sequence without an explicit opt-in. */
export function assemblySheetDefaults(initial: Partial<SyncSettings> | undefined, hasScenes: boolean, assets: Asset[], lastAssetId?: string | null): SyncSettings {
  const settings = withDefaults(initial)
  const favorites = assets.filter(asset => asset.type === 'asset' && asset.is_favorite && asset.kind !== 'audio')
  const favorite = favorites.find(asset => asset.id === lastAssetId)
    || favorites.find(asset => asset.id === settings.overlay_bars.favorite_asset_id)
    || favorites[0]
  return {
    ...settings,
    transition: { ...settings.transition, flow: 1 },
    media: { ...settings.media, with_videos: hasScenes ? false : settings.media.with_videos },
    overlay_bars: { ...settings.overlay_bars, enabled: !!favorite, favorite_asset_id: favorite?.id || null, position: 'both', height_override: 110 },
  }
}

/** The Apply button routes to the same existing assembly actions. */
export function assemblyAction(settings: SyncSettings): 'scenes_with_audio' | 'scenes' | 'effects' {
  if (settings.media.with_audio) return 'scenes_with_audio'
  if (settings.media.with_images || settings.media.with_videos) return 'scenes'
  return 'effects'
}
