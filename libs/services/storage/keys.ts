// Storage keys for every preference that moved from AsyncStorage to MMKV.
//
// This file is intentionally dependency-free: both `app-storage` (which needs
// the full key list to drive the one-time migration) and each owning module
// (which re-exports its own key) import from here, so a shared constants file
// avoids an import cycle between them.

// --- Tier 1: theme + pilgrimage/camera (frame-1 critical reads) ---
export const THEME_ID_KEY = '@aniseekr/theme';
export const THEME_CUSTOM_ACCENT_KEY = '@aniseekr/customAccent';
export const THEME_RECENT_ACCENTS_KEY = '@aniseekr/recentAccents';
export const THEME_MODE_KEY = '@aniseekr/themeMode';
export const THEME_TINT_INTENSITY_KEY = '@aniseekr/tintIntensity';
export const THEME_INCREASE_CONTRAST_KEY = '@aniseekr/increaseContrast';
export const MAP_THEME_STORAGE_KEY = 'aniseekr.pilgrimage.mapTheme.v1';
export const VISITED_SPOTS_STORAGE_KEY = 'aniseekr.pilgrimage.visited.v1';
export const SPOT_INTENTS_STORAGE_KEY = 'aniseekr.pilgrimage.spot-intents.v1';
export const CAPTURES_STORAGE_KEY = '@aniseekr/pilgrimage/captures/v1';
export const CAMERA_SETTINGS_STORAGE_KEY = 'aniseekr:camera-settings:v4';

// --- Tier 2: pref services ---
export const USER_PREFS_STORAGE_KEY = 'aniseekr.user.prefs.v1';
export const COLLECTION_SORT_MODE_STORAGE_KEY = 'aniseekr.collection.sortMode.v1';
export const BANGUMI_PREFS_STORAGE_KEY = 'aniseekr.bangumi.prefs.v1';
export const BROWSE_SOURCE_STORAGE_KEY = 'aniseekr.browseSource';
export const ALLOW_R18_STORAGE_KEY = 'aniseekr.allowR18Content';
export const ONBOARDING_COMPLETE_KEY = 'aniseekr.onboarding.complete.v1';

/**
 * Every key the one-time AsyncStorage → MMKV migration copies. Keys NOT listed
 * here (backup/sync screens, notification service, user-repository, gacha,
 * search history, etc.) deliberately stay on AsyncStorage — see Tier 3.
 */
export const MIGRATED_KEYS: readonly string[] = [
  THEME_ID_KEY,
  THEME_CUSTOM_ACCENT_KEY,
  THEME_RECENT_ACCENTS_KEY,
  THEME_MODE_KEY,
  THEME_TINT_INTENSITY_KEY,
  THEME_INCREASE_CONTRAST_KEY,
  MAP_THEME_STORAGE_KEY,
  VISITED_SPOTS_STORAGE_KEY,
  SPOT_INTENTS_STORAGE_KEY,
  CAPTURES_STORAGE_KEY,
  CAMERA_SETTINGS_STORAGE_KEY,
  USER_PREFS_STORAGE_KEY,
  COLLECTION_SORT_MODE_STORAGE_KEY,
  BANGUMI_PREFS_STORAGE_KEY,
  BROWSE_SOURCE_STORAGE_KEY,
  ALLOW_R18_STORAGE_KEY,
  ONBOARDING_COMPLETE_KEY,
] as const;
