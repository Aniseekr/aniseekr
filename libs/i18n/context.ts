import { createContext } from 'react';
import type {
  AppLanguagePreference,
  LanguageId,
  LanguageMeta,
  TranslationKey,
  TranslationValues,
} from './types';

export interface I18nContextValue {
  /** The resolved active language (system value if preference is `auto`). */
  language: LanguageId;
  /** The user's stored preference — distinct from `language` when set to `auto`. */
  preference: AppLanguagePreference;
  /** Persist a new preference. */
  setPreference: (next: AppLanguagePreference) => void;
  /** Translate a key. Prefer `useT()` for stable identities in deps arrays. */
  t: (key: TranslationKey | string, values?: TranslationValues) => string;
  /** Static metadata for the language picker. */
  languages: Record<LanguageId, LanguageMeta>;
}

// Lives outside index.tsx so presentation primitives (ThemedText, CapsText)
// can read the language without importing the provider module.
export const I18nContext = createContext<I18nContextValue | null>(null);
