import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  normalizeExperiencePrefs,
  resolveExperienceTabs,
  toggleSeekerTab,
  type ExperienceMode,
  type ExperiencePrefs,
  type SeekerTabId,
} from '../libs/navigation/experience-tabs';
import {
  loadUserPrefsSync,
  patchExperiencePrefs,
  subscribeUserPrefs,
} from '../libs/services/user-prefs';

export function useExperienceMode() {
  const [experience, setExperience] = useState<ExperiencePrefs>(() =>
    normalizeExperiencePrefs(loadUserPrefsSync().experience)
  );

  useEffect(
    () =>
      subscribeUserPrefs((prefs) => {
        setExperience(normalizeExperiencePrefs(prefs.experience));
      }),
    []
  );

  const setMode = useCallback(async (mode: ExperienceMode) => {
    return patchExperiencePrefs({ mode });
  }, []);

  const toggleTab = useCallback(async (tab: SeekerTabId) => {
    const current = normalizeExperiencePrefs(loadUserPrefsSync().experience);
    return patchExperiencePrefs({ seekerTabs: toggleSeekerTab(current.seekerTabs, tab) });
  }, []);

  const visibleTabs = useMemo(() => resolveExperienceTabs(experience), [experience]);

  return {
    experience,
    mode: experience.mode,
    seekerTabs: experience.seekerTabs,
    visibleTabs,
    setMode,
    toggleTab,
  };
}
