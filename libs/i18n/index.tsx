// React provider on top of the pure engine.
//
// - Persists the user's pick to MMKV under APP_LANGUAGE_KEY.
// - Seeds initial state synchronously so the first frame already speaks the
//   right language (no flash of English on Chinese devices).
// - `useT()` returns a memoized `t()` bound to the current language; the
//   memoization key is the language id so unrelated state changes don't
//   invalidate consumer callbacks.

import { use, useCallback, useMemo, useState, type ReactNode } from 'react';
import { kvSet } from '../services/storage/app-storage';
import { APP_LANGUAGE_KEY } from '../services/storage/keys';
import { LANGUAGES, translate } from './engine';
import { readPreferenceSync, readSystemLanguage } from './app-language';
import { I18nContext, type I18nContextValue } from './context';
import type { AppLanguagePreference, LanguageId, TranslationKey, TranslationValues } from './types';

// Re-exported for component convenience (`import { getAppLanguageSync } from
// '@/libs/i18n'`). Service / non-React code should import from
// './app-language' directly to stay off the React module's import graph.
export { getAppLanguageSync } from './app-language';

export function I18nProvider({ children }: { children: ReactNode }) {
  // Seed from MMKV synchronously — first paint already speaks the right language.
  const [preference, setPreferenceState] = useState<AppLanguagePreference>(readPreferenceSync);
  const [systemLanguage] = useState<LanguageId>(readSystemLanguage);

  const language: LanguageId = preference === 'auto' ? systemLanguage : preference;

  const setPreference = useCallback((next: AppLanguagePreference) => {
    setPreferenceState(next);
    kvSet(APP_LANGUAGE_KEY, next);
  }, []);

  const t = useCallback(
    (key: TranslationKey | string, values?: TranslationValues) => translate(language, key, values),
    [language]
  );

  const value = useMemo<I18nContextValue>(
    () => ({
      language,
      preference,
      setPreference,
      t,
      languages: LANGUAGES,
    }),
    [language, preference, setPreference, t]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = use(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be called inside <I18nProvider>');
  }
  return ctx;
}

/** Convenience hook returning just the `t` function. */
export function useT(): I18nContextValue['t'] {
  return useI18n().t;
}

export { useUiLanguage } from './ui-language';
export { capsTracking, containsCjk, isCjkLabel, isCjkLanguage } from './script';

export { LANGUAGES, LANGUAGE_IDS, resolveSystemLanguage, translate } from './engine';
export type {
  AppLanguagePreference,
  LanguageId,
  LanguageMeta,
  TranslationKey,
  TranslationValues,
} from './types';
