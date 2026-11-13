import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  normalizeExperiencePrefs,
  resolveExperienceTabs,
  seekerTabLimit,
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
import { useSubscription } from '../context/SubscriptionContext';

export function useExperienceMode() {
  const { isPro } = useSubscription();
  const tabLimit = seekerTabLimit(isPro);
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

  const toggleTab = useCallback(
    async (tab: SeekerTabId) => {
      const current = normalizeExperiencePrefs(loadUserPrefsSync().experience);
      return patchExperiencePrefs({
        seekerTabs: toggleSeekerTab(current.seekerTabs, tab, tabLimit),
      });
    },
    [tabLimit]
  );

  const visibleTabs = useMemo(() => resolveExperienceTabs(experience, isPro), [experience, isPro]);
  const seekerTabs = useMemo(
    () => experience.seekerTabs.slice(0, tabLimit),
    [experience.seekerTabs, tabLimit]
  );

  return {
    experience,
    mode: experience.mode,
    seekerTabs,
    tabLimit,
    isPro,
    visibleTabs,
    setMode,
    toggleTab,
  };
}
