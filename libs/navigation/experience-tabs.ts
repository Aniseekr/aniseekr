export type ExperienceMode = 'explorer' | 'collector' | 'seeker';

export type ExperienceTabId =
  | 'discover'
  | 'bangumi'
  | 'collection'
  | 'pilgrimage'
  | 'explorerCamera'
  | 'explorerSearch'
  | 'explorerMap'
  | 'explorerJournal'
  | 'profile';

export type SeekerTabId = Exclude<ExperienceTabId, 'profile'>;
export type ExperienceTabRouteName =
  | '(rate)'
  | 'bangumi'
  | 'collection'
  | 'pilgrimage'
  | 'explorer-camera'
  | 'explorer-search'
  | 'explorer-map'
  | 'explorer-journal'
  | 'profile';
export type ExperienceTabHref =
  | '/(rate)'
  | '/bangumi'
  | '/collection'
  | '/pilgrimage'
  | '/explorer-camera'
  | '/explorer-search'
  | '/explorer-map'
  | '/explorer-journal'
  | '/profile';

export interface ExperiencePrefs {
  mode: ExperienceMode;
  seekerTabs: SeekerTabId[];
}

export const MAX_SEEKER_CONTENT_TABS = 4;

export const SEEKER_TAB_CATALOG: readonly SeekerTabId[] = [
  'discover',
  'bangumi',
  'collection',
  'pilgrimage',
  'explorerCamera',
  'explorerSearch',
  'explorerMap',
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
  explorerSearch: '/explorer-search',
  explorerMap: '/explorer-map',
  explorerJournal: '/explorer-journal',
  profile: '/profile',
};

export const EXPERIENCE_TAB_ROUTE_NAMES: Record<ExperienceTabId, ExperienceTabRouteName> = {
  discover: '(rate)',
  bangumi: 'bangumi',
  collection: 'collection',
  pilgrimage: 'pilgrimage',
  explorerCamera: 'explorer-camera',
  explorerSearch: 'explorer-search',
  explorerMap: 'explorer-map',
  explorerJournal: 'explorer-journal',
  profile: 'profile',
};

const FIXED_TABS: Record<Exclude<ExperienceMode, 'seeker'>, readonly ExperienceTabId[]> = {
  explorer: ['pilgrimage', 'explorerJournal', 'explorerCamera', 'explorerSearch', 'profile'],
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
  } else {
    seekerTabs.push(...DEFAULT_EXPERIENCE_PREFS.seekerTabs);
  }
  return { mode, seekerTabs };
}

export function resolveExperienceTabs(prefs: ExperiencePrefs): ExperienceTabId[] {
  if (prefs.mode !== 'seeker') return [...FIXED_TABS[prefs.mode]];
  return [...prefs.seekerTabs, 'profile'];
}

export function resolveExperienceRouteNames(prefs: ExperiencePrefs): ExperienceTabRouteName[] {
  return resolveExperienceTabs(prefs).map((tab) => EXPERIENCE_TAB_ROUTE_NAMES[tab]);
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

export function toggleSeekerTab(tabs: readonly SeekerTabId[], tab: SeekerTabId): SeekerTabId[] {
  if (tabs.includes(tab)) return tabs.filter((candidate) => candidate !== tab);
  if (tabs.length >= MAX_SEEKER_CONTENT_TABS) return [...tabs];
  return [...tabs, tab];
}
