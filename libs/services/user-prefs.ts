import { Logger } from '../utils/logger';
import { dataSourceConfig } from './data-source-config';
import {
  DEFAULT_PROFILE_SHORTCUTS,
  normalizeProfileShortcuts,
  type ShortcutId,
} from './profile-shortcuts';

interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem?(key: string): Promise<void>;
}

let AsyncStorage: AsyncStorageLike;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  AsyncStorage = require('@react-native-async-storage/async-storage').default;
} catch {
  const memoryStorage = new Map<string, string>();
  AsyncStorage = {
    getItem: async (k: string) => memoryStorage.get(k) ?? null,
    setItem: async (k: string, v: string) => {
      memoryStorage.set(k, v);
    },
    removeItem: async (k: string) => {
      memoryStorage.delete(k);
    },
  };
}

export const USER_PREFS_STORAGE_KEY = 'aniseekr.user.prefs.v1';

export type SwipeMode = 'plan' | 'like';
export type SwipeContentMode = 'fill' | 'fit';
export type SwipeRatingButtons = 'three' | 'five';

export interface SwipePrefs {
  // Right-swipe semantic: 'plan' adds to plan_to_watch, 'like' adds to favorites.
  mode: SwipeMode;
  contentMode: SwipeContentMode;
  // Bottom rating row layout used in Like mode.
  ratingButtons: SwipeRatingButtons;
  showAIInsights: boolean;
  trackingShortcut: boolean;
  showOriginalTitle: boolean;
}

export const DEFAULT_SWIPE_PREFS: SwipePrefs = {
  mode: 'plan',
  contentMode: 'fill',
  ratingButtons: 'three',
  showAIInsights: true,
  trackingShortcut: false,
  showOriginalTitle: false,
};

export type SeasonalLayout = 'carousel' | 'hero-rail' | 'showcase' | 'spotlight';

export const SEASONAL_LAYOUTS: readonly SeasonalLayout[] = [
  'carousel',
  'hero-rail',
  'showcase',
  'spotlight',
] as const;

export interface UserPrefs {
  cardHeightPercent: number; // 70-100
  allowAdultContent: boolean;
  bangumiIncludeGames: boolean;
  bangumiShowScoreProminently: boolean;
  profileShortcuts: ShortcutId[];
  // Folder targeted by the long-press quick-add on the anime detail page.
  // Stores either a system folder id (e.g. 'system_favorites') or a custom uuid.
  lastAddedFolderId: string;
  swipe: SwipePrefs;
  seasonalLayout: SeasonalLayout;
}

export const DEFAULT_USER_PREFS: UserPrefs = {
  cardHeightPercent: 85,
  allowAdultContent: false,
  bangumiIncludeGames: false,
  bangumiShowScoreProminently: true,
  profileShortcuts: [...DEFAULT_PROFILE_SHORTCUTS],
  lastAddedFolderId: 'system_favorites',
  swipe: { ...DEFAULT_SWIPE_PREFS },
  seasonalLayout: 'carousel',
};

export async function loadUserPrefs(): Promise<UserPrefs> {
  try {
    const raw = await AsyncStorage.getItem(USER_PREFS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_USER_PREFS };
    const parsed = JSON.parse(raw) as Partial<UserPrefs>;
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_USER_PREFS };
    const result: UserPrefs = {
      ...DEFAULT_USER_PREFS,
      ...parsed,
      profileShortcuts: normalizeProfileShortcuts(parsed.profileShortcuts),
      swipe: { ...DEFAULT_SWIPE_PREFS, ...(parsed.swipe ?? {}) },
      seasonalLayout: SEASONAL_LAYOUTS.includes(parsed.seasonalLayout as SeasonalLayout)
        ? (parsed.seasonalLayout as SeasonalLayout)
        : DEFAULT_USER_PREFS.seasonalLayout,
    };
    // Mirror the adult-content flag onto the data-source config so the read
    // pipeline (AniList isAdult, Jikan sfw, repository safety net) reflects
    // the user's choice without a separate toggle.
    void syncAdultFlag(result.allowAdultContent);
    return result;
  } catch (err) {
    Logger.warn('[UserPrefs] load failed, using defaults', err);
    return { ...DEFAULT_USER_PREFS };
  }
}

export async function saveUserPrefs(prefs: UserPrefs): Promise<void> {
  try {
    await AsyncStorage.setItem(USER_PREFS_STORAGE_KEY, JSON.stringify(prefs));
    await syncAdultFlag(prefs.allowAdultContent);
  } catch (err) {
    Logger.warn('[UserPrefs] save failed', err);
  }
}

export async function patchUserPrefs(patch: Partial<UserPrefs>): Promise<UserPrefs> {
  const current = await loadUserPrefs();
  const next: UserPrefs = { ...current, ...patch };
  await saveUserPrefs(next);
  return next;
}

async function syncAdultFlag(allow: boolean): Promise<void> {
  try {
    if (!dataSourceConfig.isInitialized) {
      await dataSourceConfig.init();
    }
    if (dataSourceConfig.allowR18Content !== allow) {
      await dataSourceConfig.setAllowR18Content(allow);
    }
  } catch (err) {
    Logger.warn('[UserPrefs] sync adult flag failed', err);
  }
}

export async function patchSwipePrefs(patch: Partial<SwipePrefs>): Promise<SwipePrefs> {
  const current = await loadUserPrefs();
  const nextSwipe: SwipePrefs = { ...current.swipe, ...patch };
  await saveUserPrefs({ ...current, swipe: nextSwipe });
  return nextSwipe;
}
