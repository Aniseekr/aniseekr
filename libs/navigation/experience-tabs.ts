export type ExperienceMode = 'explorer' | 'collector' | 'seeker';

export type ExperienceTabId = 'discover' | 'bangumi' | 'collection' | 'pilgrimage' | 'profile';

export type SeekerTabId = Exclude<ExperienceTabId, 'profile'>;
export type ExperienceTabHref = '/(rate)' | '/bangumi' | '/collection' | '/pilgrimage' | '/profile';

export interface ExperiencePrefs {
  mode: ExperienceMode;
  seekerTabs: SeekerTabId[];
}

export const SEEKER_TAB_CATALOG: readonly SeekerTabId[] = [
  'discover',
  'bangumi',
  'collection',
  'pilgrimage',
] as const;

export const DEFAULT_EXPERIENCE_PREFS: ExperiencePrefs = {
  mode: 'seeker',
  seekerTabs: [...SEEKER_TAB_CATALOG],
};

export const EXPERIENCE_TAB_HREFS: Record<ExperienceTabId, ExperienceTabHref> = {
  discover: '/(rate)',
  bangumi: '/bangumi',
  collection: '/collection',
  pilgrimage: '/pilgrimage',
  profile: '/profile',
};

const FIXED_TABS: Record<Exclude<ExperienceMode, 'seeker'>, readonly ExperienceTabId[]> = {
  // Phase 1 only exposes routes that already exist. Camera, Search, Map, and
  // Journal become first-class Explorer tabs when their route shells land.
  explorer: ['pilgrimage', 'profile'],
  // Rating becomes a first-class Collector tab in the next page phase.
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

export function resolveExperienceLandingHref(prefs: ExperiencePrefs): ExperienceTabHref {
  const firstTab = resolveExperienceTabs(prefs)[0] ?? 'profile';
  return EXPERIENCE_TAB_HREFS[firstTab];
}

export function toggleSeekerTab(tabs: readonly SeekerTabId[], tab: SeekerTabId): SeekerTabId[] {
  if (tabs.includes(tab)) return tabs.filter((candidate) => candidate !== tab);
  return [...tabs, tab];
}
