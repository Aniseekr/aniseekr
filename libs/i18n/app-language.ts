// React-free sync reads of the app language.
//
// Lives apart from `index.tsx` (the React provider) on purpose: service code
// and imperative call sites (share builders, pilgrimage title resolution,
// capture pipelines) need the active language without pulling the React
// context module — and its react/react-native-heavy graph — into their import
// chain. Importing those from `index.tsx` created a circular-load ordering
// hazard under Bun's concurrent module evaluation (the named export read as
// "not found" when a service module and a screen module raced index.tsx).
//
// Mirrors `title-language.ts` / `data-language-prefs.ts`: pure, no hooks.

import { NativeModules, Platform } from 'react-native';
import { kvGet } from '../services/storage/app-storage';
import { APP_LANGUAGE_KEY } from '../services/storage/keys';
import { resolveSystemLanguage } from './engine';
import type { AppLanguagePreference, LanguageId } from './types';

export function readSystemLanguage(): LanguageId {
  if (Platform.OS === 'ios') {
    const settings =
      (NativeModules?.SettingsManager?.settings as
        | { AppleLocale?: string; AppleLanguages?: string[] }
        | undefined) ?? undefined;
    const tag = settings?.AppleLocale ?? settings?.AppleLanguages?.[0];
    return resolveSystemLanguage(tag);
  }
  if (Platform.OS === 'android') {
    const tag = (NativeModules?.I18nManager?.localeIdentifier as string | undefined) ?? undefined;
    return resolveSystemLanguage(tag);
  }
  if (typeof navigator !== 'undefined' && navigator.language) {
    return resolveSystemLanguage(navigator.language);
  }
  return 'en';
}

export function readPreferenceSync(): AppLanguagePreference {
  const raw = kvGet(APP_LANGUAGE_KEY);
  if (raw === 'auto') return 'auto';
  if (raw === 'en' || raw === 'zh-Hant' || raw === 'zh-Hans' || raw === 'ja' || raw === 'ko') {
    return raw;
  }
  return 'auto';
}

/**
 * Sync, React-free read of the active app language — same resolution the
 * provider seeds from (stored preference, else system locale). NOT reactive:
 * callers re-read per invocation.
 */
export function getAppLanguageSync(): LanguageId {
  const preference = readPreferenceSync();
  return preference === 'auto' ? readSystemLanguage() : preference;
}
