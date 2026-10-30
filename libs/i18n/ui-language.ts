import { use } from 'react';
import { getAppLanguageSync } from './app-language';
import { I18nContext } from './context';
import type { LanguageId } from './types';

/**
 * Active UI language for presentation primitives. Unlike `useI18n()` it never
 * throws: text rendered above <I18nProvider> (root error fallbacks) falls back
 * to the persisted preference.
 */
export function useUiLanguage(): LanguageId {
  return use(I18nContext)?.language ?? getAppLanguageSync();
}
