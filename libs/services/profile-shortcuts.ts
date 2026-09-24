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
  | 'attribution'
  | 'terms'
  | 'theme-preview'
  | 'design-tokens';

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
    route: '/(setting)/otaku-dna',
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
    icon: 'cloud-upload-outline',
    route: '/(setting)/import-wizard',
  },
  attribution: {
    id: 'attribution',
    labelKey: 'profile.shortcut.credits',
    icon: 'ribbon-outline',
    route: '/(setting)/attribution',
  },
  terms: {
    id: 'terms',
    labelKey: 'profile.shortcut.terms',
    icon: 'document-text-outline',
    route: '/(setting)/terms',
  },
  'theme-preview': {
    id: 'theme-preview',
    labelKey: 'profile.shortcut.preview',
    icon: 'eye-outline',
    route: '/(setting)/theme-preview',
  },
  'design-tokens': {
    id: 'design-tokens',
    labelKey: 'profile.shortcut.tokens',
    icon: 'cube-outline',
    route: '/(setting)/design-tokens',
  },
};

export const PROFILE_SHORTCUT_COUNT = 8;

export const DEFAULT_PROFILE_SHORTCUTS: ShortcutId[] = [
  'notifications',
  'language',
  'privacy',
  'cache',
  'appearance',
  'sync-hub',
  'data-source',
  'otaku-dna',
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
