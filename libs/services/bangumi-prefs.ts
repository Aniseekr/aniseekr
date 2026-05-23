import {
  DEFAULT_BANGUMI_PREFS,
  type BangumiPreferences,
} from '../../components/bangumi/BangumiSettingsSheet';
import { patchUserPrefs } from './user-prefs';
import { kvGet, kvSet, migrateToMMKV } from './storage/app-storage';
import { BANGUMI_PREFS_STORAGE_KEY } from './storage/keys';
import { Logger } from '../utils/logger';

export { BANGUMI_PREFS_STORAGE_KEY };

export async function loadBangumiPrefs(): Promise<BangumiPreferences> {
  try {
    await migrateToMMKV();
    const raw = kvGet(BANGUMI_PREFS_STORAGE_KEY);
    if (!raw) return DEFAULT_BANGUMI_PREFS;
    const parsed = JSON.parse(raw) as Partial<BangumiPreferences> & {
      showAdult?: boolean;
    };
    if (!parsed || typeof parsed !== 'object') return DEFAULT_BANGUMI_PREFS;
    // Migration shim: legacy blobs carried `showAdult` here; promote a `true`
    // value once into the unified `allowAdultContent` user-pref and strip the
    // field from the in-memory result so it is not re-persisted.
    const { showAdult, ...rest } = parsed;
    if (showAdult === true) {
      void patchUserPrefs({ allowAdultContent: true }).catch(() => {});
    }
    const merged = { ...DEFAULT_BANGUMI_PREFS, ...rest };
    // Migration: old blobs may not have `baseViewMode`. Seed it from the
    // current viewMode if it's a base view; otherwise keep the default.
    if (rest.baseViewMode === undefined && (rest.viewMode === 'calendar' || rest.viewMode === 'list')) {
      merged.baseViewMode = rest.viewMode;
    }
    return merged;
  } catch (err) {
    Logger.warn('[BangumiPrefs] load failed, using defaults', err);
    return DEFAULT_BANGUMI_PREFS;
  }
}

export async function saveBangumiPrefs(prefs: BangumiPreferences): Promise<void> {
  try {
    kvSet(BANGUMI_PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch (err) {
    Logger.warn('[BangumiPrefs] save failed', err);
  }
}
