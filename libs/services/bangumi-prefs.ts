import type { BangumiPreferences } from '../../components/bangumi/BangumiSettingsSheet';
import { patchUserPrefs } from './user-prefs';
import { kvGet, kvSet } from './storage/app-storage';
import { BANGUMI_PREFS_STORAGE_KEY } from './storage/keys';
import { Logger } from '../utils/logger';

export { BANGUMI_PREFS_STORAGE_KEY };

const DEFAULT_BANGUMI_PREFS: BangumiPreferences = {
  viewMode: 'calendar',
  baseViewMode: 'calendar',
  filterMode: 'all',
  typeFilter: 'all',
  showUnknownDays: false,
  notificationsEnabled: true,
};

function normalizeLoadedPrefs(
  rest: Partial<BangumiPreferences>
): BangumiPreferences {
  const merged = { ...DEFAULT_BANGUMI_PREFS, ...rest };
  // Migration: old blobs may not have `baseViewMode`. Seed it from the
  // current viewMode if it's a base view; otherwise keep the default.
  if (
    rest.baseViewMode === undefined &&
    (rest.viewMode === 'calendar' || rest.viewMode === 'list')
  ) {
    merged.baseViewMode = rest.viewMode;
  }
  // `cards` is a transient full-screen swipe mode. Persisting/restoring it
  // makes the tab repeatedly reopen in swipe mode after a remount; start from
  // the user's selected base mode instead.
  if (merged.viewMode === 'cards') {
    merged.viewMode = merged.baseViewMode;
  }
  return merged;
}

function normalizePrefsForStorage(prefs: BangumiPreferences): BangumiPreferences {
  if (prefs.viewMode !== 'cards') return prefs;
  return { ...prefs, viewMode: prefs.baseViewMode };
}

/**
 * Synchronous MMKV read. Safe for first-frame `useState` initialisers.
 * The async {@link loadBangumiPrefs} wraps this so existing call sites keep
 * working; new code should prefer the sync variant to avoid skeleton flash.
 */
export function loadBangumiPrefsSync(): BangumiPreferences {
  try {
    const raw = kvGet(BANGUMI_PREFS_STORAGE_KEY);
    if (!raw) return DEFAULT_BANGUMI_PREFS;
    const parsed = JSON.parse(raw) as Partial<BangumiPreferences> & {
      showAdult?: boolean;
    };
    if (!parsed || typeof parsed !== 'object') return DEFAULT_BANGUMI_PREFS;
    // Strip the legacy `showAdult` field from the in-memory result so it is
    // not re-persisted. The async wrapper promotes a `true` value into the
    // unified `allowAdultContent` user-pref; this sync path can't do that
    // without making the read async, so callers that care should also call
    // the async `loadBangumiPrefs` once for the side effect.
    const { showAdult: _ignored, ...rest } = parsed;
    void _ignored;
    return normalizeLoadedPrefs(rest);
  } catch (err) {
    Logger.warn('[BangumiPrefs] load failed, using defaults', err);
    return DEFAULT_BANGUMI_PREFS;
  }
}

export async function loadBangumiPrefs(): Promise<BangumiPreferences> {
  try {
    const raw = kvGet(BANGUMI_PREFS_STORAGE_KEY);
    if (!raw) return DEFAULT_BANGUMI_PREFS;
    const parsed = JSON.parse(raw) as Partial<BangumiPreferences> & {
      showAdult?: boolean;
    };
    if (!parsed || typeof parsed !== 'object') return DEFAULT_BANGUMI_PREFS;
    const { showAdult, ...rest } = parsed;
    if (showAdult === true) {
      // Fire-and-forget: promote legacy `showAdult` into the unified pref.
      void patchUserPrefs({ allowAdultContent: true }).catch(() => {});
    }
    return normalizeLoadedPrefs(rest);
  } catch (err) {
    Logger.warn('[BangumiPrefs] load failed, using defaults', err);
    return DEFAULT_BANGUMI_PREFS;
  }
}

export async function saveBangumiPrefs(prefs: BangumiPreferences): Promise<void> {
  try {
    kvSet(BANGUMI_PREFS_STORAGE_KEY, JSON.stringify(normalizePrefsForStorage(prefs)));
  } catch (err) {
    Logger.warn('[BangumiPrefs] save failed', err);
  }
}
