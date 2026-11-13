export type ExperienceMode = 'explorer' | 'collector' | 'seeker';

export type ExperienceTabId =
  | 'discover'
  | 'bangumi'
  | 'collection'
  | 'pilgrimage'
  | 'explorerCamera'
  | 'explorerJournal'
  | 'profile';

export type SeekerTabId = Exclude<ExperienceTabId, 'profile'>;
export type ExperienceTabRouteName =
  | '(rate)'
  | 'bangumi'
  | 'collection'
  | 'pilgrimage'
  | 'explorer-camera'
  | 'explorer-journal'
  | 'profile';
export type ExperienceTabHref =
  | '/(rate)'
  | '/bangumi'
  | '/collection'
  | '/pilgrimage'
  | '/explorer-camera'
  | '/explorer-journal'
  | '/profile';

export interface ExperiencePrefs {
  mode: ExperienceMode;
  seekerTabs: SeekerTabId[];
}

/** Stored for everyone; the fifth tab only shows with Pro. */
export const MAX_SEEKER_CONTENT_TABS = 5;
export const FREE_SEEKER_CONTENT_TABS = 4;

export function seekerTabLimit(isPro: boolean): number {
  return isPro ? MAX_SEEKER_CONTENT_TABS : FREE_SEEKER_CONTENT_TABS;
}

export const SEEKER_TAB_CATALOG: readonly SeekerTabId[] = [
  'discover',
  'bangumi',
  'collection',
  'pilgrimage',
  'explorerCamera',
  'explorerJournal',
] as const;

export const DEFAULT_EXPERIENCE_PREFS: ExperiencePrefs = {
  mode: 'seeker',
  seekerTabs: ['discover', 'bangumi', 'collection', 'pilgrimage'],
};

export const EXPERIENCE_TAB_HREFS: Record<ExperienceTabId, ExperienceTabHref> = {
  discover: '/(rate)',
  bangumi: '/bangumi',
  collection: '/collection',
  pilgrimage: '/pilgrimage',
  explorerCamera: '/explorer-camera',
  explorerJournal: '/explorer-journal',
  profile: '/profile',
};

export const EXPERIENCE_TAB_ROUTE_NAMES: Record<ExperienceTabId, ExperienceTabRouteName> = {
  discover: '(rate)',
  bangumi: 'bangumi',
  collection: 'collection',
  pilgrimage: 'pilgrimage',
  explorerCamera: 'explorer-camera',
  explorerJournal: 'explorer-journal',
  profile: 'profile',
};

const FIXED_TABS: Record<Exclude<ExperienceMode, 'seeker'>, readonly ExperienceTabId[]> = {
  explorer: ['pilgrimage', 'explorerCamera', 'explorerJournal', 'profile'],
  collector: ['discover', 'bangumi', 'collection', 'profile'],
};

const EXPERIENCE_MODES: readonly ExperienceMode[] = ['explorer', 'collector', 'seeker'];

export function normalizeExperiencePrefs(input: unknown): ExperiencePrefs {
  if (!input || typeof input !== 'object') {
    return {
      mode: DEFAULT_EXPERIENCE_PREFS.mode,
      seekerTabs: [...DEFAULT_EXPERIENCE_PREFS.seekerTabs],
    };
  }
  const candidate = input as { mode?: unknown; seekerTabs?: unknown };
  const mode =
    typeof candidate.mode === 'string' &&
    EXPERIENCE_MODES.includes(candidate.mode as ExperienceMode)
      ? (candidate.mode as ExperienceMode)
      : DEFAULT_EXPERIENCE_PREFS.mode;
  const seekerTabs: SeekerTabId[] = [];
  if (Array.isArray(candidate.seekerTabs)) {
    for (const id of candidate.seekerTabs) {
      if (typeof id !== 'string' || !SEEKER_TAB_CATALOG.includes(id as SeekerTabId)) continue;
      const valid = id as SeekerTabId;
      if (!seekerTabs.includes(valid)) seekerTabs.push(valid);
      if (seekerTabs.length === MAX_SEEKER_CONTENT_TABS) break;
    }
  }
  if (seekerTabs.length === 0) {
    seekerTabs.push(...DEFAULT_EXPERIENCE_PREFS.seekerTabs);
  }
  return { mode, seekerTabs };
}

export function resolveExperienceTabs(prefs: ExperiencePrefs, isPro = false): ExperienceTabId[] {
  if (prefs.mode !== 'seeker') return [...FIXED_TABS[prefs.mode]];
  return [...prefs.seekerTabs.slice(0, seekerTabLimit(isPro)), 'profile'];
}

export function resolveExperienceRouteNames(
  prefs: ExperiencePrefs,
  isPro = false
): ExperienceTabRouteName[] {
  return resolveExperienceTabs(prefs, isPro).map((tab) => EXPERIENCE_TAB_ROUTE_NAMES[tab]);
}

export function resolveExperienceLandingHref(prefs: ExperiencePrefs): ExperienceTabHref {
  const firstTab = resolveExperienceTabs(prefs)[0] ?? 'profile';
  return EXPERIENCE_TAB_HREFS[firstTab];
}

export function resolveExperienceTabTarget<TFallback extends string>(
  visibleTabs: readonly ExperienceTabId[],
  target: ExperienceTabId,
  fallbackHref: TFallback
): { href: ExperienceTabHref; isVisibleTab: true } | { href: TFallback; isVisibleTab: false } {
  if (visibleTabs.includes(target)) {
    return { href: EXPERIENCE_TAB_HREFS[target], isVisibleTab: true };
  }
  return { href: fallbackHref, isVisibleTab: false };
}

/** `stored` may hold a fifth tab from a Pro period; only the first `limit` count. */
export function toggleSeekerTab(
  stored: readonly SeekerTabId[],
  tab: SeekerTabId,
  limit: number = FREE_SEEKER_CONTENT_TABS
): SeekerTabId[] {
  const tabs = stored.slice(0, limit);
  if (tabs.includes(tab)) {
    if (tabs.length <= 1) return tabs;
    return tabs.filter((candidate) => candidate !== tab);
  }
  if (tabs.length >= limit) return tabs;
  return [...tabs, tab];
}
