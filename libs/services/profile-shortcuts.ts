import type { ComponentProps } from 'react';
import type Ionicons from '@expo/vector-icons/Ionicons';
import type { TranslationKey } from '../i18n/types';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

export type ShortcutId =
  | 'notifications'
  | 'appearance'
  | 'language'
  | 'privacy'
  | 'cache'
  | 'sync-hub'
  | 'data-source'
  | 'otaku-dna'
  | 'account'
  | 'achievements'
  | 'import'
  | 'backup'
  | 'watch-platforms'
  | 'trending'
  | 'year-in-review'
  | 'characters';

export interface ShortcutSpec {
  id: ShortcutId;
  labelKey: TranslationKey;
  icon: IoniconName;
  route: string;
}

const SHORTCUT_CATALOG: Record<ShortcutId, ShortcutSpec> = {
  notifications: {
    id: 'notifications',
    labelKey: 'profile.shortcut.notifications',
    icon: 'notifications-outline',
    route: '/(setting)/notifications',
  },
  appearance: {
    id: 'appearance',
    labelKey: 'profile.shortcut.appearance',
    icon: 'color-palette-outline',
    route: '/(setting)/appearance',
  },
  language: {
    id: 'language',
    labelKey: 'profile.shortcut.language',
    icon: 'language-outline',
    route: '/(setting)/language',
  },
  privacy: {
    id: 'privacy',
    labelKey: 'profile.shortcut.privacy',
    icon: 'shield-checkmark-outline',
    route: '/(setting)/privacy',
  },
  cache: {
    id: 'cache',
    labelKey: 'profile.shortcut.cache',
    icon: 'cloud-download-outline',
    route: '/(setting)/cache',
  },
  'sync-hub': {
    id: 'sync-hub',
    labelKey: 'profile.shortcut.syncHub',
    icon: 'sync-outline',
    route: '/(setting)/sync-hub',
  },
  'data-source': {
    id: 'data-source',
    labelKey: 'profile.shortcut.sources',
    icon: 'cloud-outline',
    route: '/(setting)/data-source',
  },
  'otaku-dna': {
    id: 'otaku-dna',
    labelKey: 'profile.shortcut.otakuDna',
    icon: 'finger-print-outline',
    route: '/stats',
  },
  account: {
    id: 'account',
    labelKey: 'profile.shortcut.accounts',
    icon: 'people-circle-outline',
    route: '/(setting)/account',
  },
  achievements: {
    id: 'achievements',
    labelKey: 'profile.shortcut.trophies',
    icon: 'trophy-outline',
    route: '/(setting)/achievements',
  },
  import: {
    id: 'import',
    labelKey: 'profile.shortcut.import',
    icon: 'download-outline',
    route: '/(setting)/import-wizard',
  },
  backup: {
    id: 'backup',
    labelKey: 'settings.backupShort',
    icon: 'cloud-upload-outline',
    route: '/(setting)/backup',
  },
  'watch-platforms': {
    id: 'watch-platforms',
    labelKey: 'settings.watchPlatforms',
    icon: 'play-circle-outline',
    route: '/(setting)/watch-platforms',
  },
  trending: {
    id: 'trending',
    labelKey: 'settingsUi.trending',
    icon: 'trending-up-outline',
    route: '/trending',
  },
  'year-in-review': {
    id: 'year-in-review',
    labelKey: 'collectionUi.yearInReview',
    icon: 'book-outline',
    route: '/stats/year-in-review',
  },
  characters: {
    id: 'characters',
    labelKey: 'profile.shortcut.characters',
    icon: 'people-outline',
    route: '/companion/library',
  },
};

/** Slots stored for everyone, so a Premium layout survives a lapsed subscription. */
export const PROFILE_SHORTCUT_COUNT = 12;
/** Slots shown without Premium: the first two rows. */
export const FREE_PROFILE_SHORTCUT_COUNT = 8;

export function visibleShortcutCount(isPro: boolean): number {
  return isPro ? PROFILE_SHORTCUT_COUNT : FREE_PROFILE_SHORTCUT_COUNT;
}

// Features first: legal and developer pages live in Settings, not here.
// The last four are the Premium third row.
export const DEFAULT_PROFILE_SHORTCUTS: ShortcutId[] = [
  'otaku-dna',
  'achievements',
  'account',
  'sync-hub',
  'import',
  'characters',
  'notifications',
  'appearance',
  'trending',
  'year-in-review',
  'backup',
  'watch-platforms',
];

export function getShortcutSpec(id: string): ShortcutSpec | null {
  return SHORTCUT_CATALOG[id as ShortcutId] ?? null;
}

export function listShortcuts(): ShortcutSpec[] {
  return Object.values(SHORTCUT_CATALOG);
}

export function normalizeProfileShortcuts(input?: readonly string[] | null): ShortcutId[] {
  const seen = new Set<ShortcutId>();
  const out: ShortcutId[] = [];
  const push = (id: ShortcutId) => {
    if (seen.has(id) || out.length >= PROFILE_SHORTCUT_COUNT) return;
    seen.add(id);
    out.push(id);
  };
  for (const raw of input ?? []) {
    const spec = getShortcutSpec(raw);
    if (spec) push(spec.id);
  }
  for (const id of DEFAULT_PROFILE_SHORTCUTS) push(id);
  for (const id of Object.keys(SHORTCUT_CATALOG) as ShortcutId[]) push(id);
  return out;
}
