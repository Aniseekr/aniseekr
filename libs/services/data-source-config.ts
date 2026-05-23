import type { PlatformType } from './auth/types';
import { Logger } from '../utils/logger';

import { kvGet, kvSet, migrateToMMKV } from './storage/app-storage';
import { ALLOW_R18_STORAGE_KEY, BROWSE_SOURCE_STORAGE_KEY } from './storage/keys';

export { BROWSE_SOURCE_STORAGE_KEY, ALLOW_R18_STORAGE_KEY };
export const DEFAULT_BROWSE_SOURCE: PlatformType = 'anilist';

/**
 * Platforms that expose a usable browse/read surface (search, top, seasonal).
 * Kavita is excluded — it's a self-hosted personal library, not a discovery
 * source. Annict is excluded because it lacks top/seasonal endpoints
 * (per `provider_matrix.csv`).
 */
export const BROWSE_SUPPORTED_PLATFORMS: readonly PlatformType[] = [
  'anilist',
  'myanimelist',
  'bangumi',
  'kitsu',
  'shikimori',
  'simkl',
] as const;

export function isSupportedBrowseSource(platform: PlatformType): boolean {
  return (BROWSE_SUPPORTED_PLATFORMS as readonly PlatformType[]).includes(platform);
}

/**
 * Singleton storing user-tunable knobs that affect the read pipeline:
 *   - browseSource    → which platform feeds top/seasonal screens
 *   - allowR18Content → whether NSFW results pass through the SFW filter
 *
 * Both values are persisted via AsyncStorage and re-hydrated by `init()`.
 */
export class DataSourceConfig {
  private static instance: DataSourceConfig | null = null;
  private _browseSource: PlatformType = DEFAULT_BROWSE_SOURCE;
  private _allowR18Content = false;
  private _initialized = false;

  static getInstance(): DataSourceConfig {
    if (!DataSourceConfig.instance) {
      DataSourceConfig.instance = new DataSourceConfig();
    }
    return DataSourceConfig.instance;
  }

  static __resetForTests(): void {
    DataSourceConfig.instance = null;
  }

  get browseSource(): PlatformType {
    return this._browseSource;
  }

  get allowR18Content(): boolean {
    return this._allowR18Content;
  }

  get isInitialized(): boolean {
    return this._initialized;
  }

  /**
   * Hydrate values from MMKV. Idempotent — safe to call from app bootstrap
   * and again from tests.
   */
  async init(): Promise<void> {
    try {
      await migrateToMMKV();
      const browseRaw = kvGet(BROWSE_SOURCE_STORAGE_KEY);
      const r18Raw = kvGet(ALLOW_R18_STORAGE_KEY);

      if (browseRaw && isSupportedBrowseSource(browseRaw as PlatformType)) {
        this._browseSource = browseRaw as PlatformType;
      } else {
        this._browseSource = DEFAULT_BROWSE_SOURCE;
      }

      this._allowR18Content = r18Raw === 'true';
    } catch (err) {
      Logger.warn('[DataSourceConfig] init failed, using defaults', err);
      this._browseSource = DEFAULT_BROWSE_SOURCE;
      this._allowR18Content = false;
    } finally {
      this._initialized = true;
    }
  }

  /**
   * Update the browse source and persist. Throws if `platform` doesn't
   * support browsing (per `BROWSE_SUPPORTED_PLATFORMS`).
   */
  async setBrowseSource(platform: PlatformType): Promise<void> {
    if (!isSupportedBrowseSource(platform)) {
      throw new Error(`Platform ${platform} does not support browse mode`);
    }
    this._browseSource = platform;
    kvSet(BROWSE_SOURCE_STORAGE_KEY, platform);
  }

  async setAllowR18Content(allow: boolean): Promise<void> {
    this._allowR18Content = allow;
    kvSet(ALLOW_R18_STORAGE_KEY, allow ? 'true' : 'false');
  }
}

export const dataSourceConfig = DataSourceConfig.getInstance();
