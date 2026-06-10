// Anime title language priority.
//
// Two-layer preference:
//   1. No stored order  → derive the order from the app UI language, so
//      switching the app to 中文 immediately surfaces Chinese titles. This is
//      the default for everyone who never touched the reorder UI.
//   2. Stored order     → the user explicitly reordered languages on the
//      Language settings screen; that order wins regardless of UI language.
//
// This module is React-free (mirrors `data-language-prefs.ts`). Consumers
// that render titles subscribe via `subscribeTitleOrder` —
// `useAnimeDisplayTitle` wraps that in `useSyncExternalStore`.

import { kvGet, kvRemove, kvSet } from '../services/storage/app-storage';
import { LANGUAGE_PRIORITY_KEY } from '../services/storage/keys';
import { safeJsonParse } from '../utils/safe-json';

export type TitleLanguageId = 'english' | 'romaji' | 'japanese' | 'chinese' | 'russian';

export const TITLE_LANGUAGE_IDS: readonly TitleLanguageId[] = [
  'english',
  'romaji',
  'japanese',
  'chinese',
  'russian',
];

const FALLBACK_ORDER: readonly TitleLanguageId[] = TITLE_LANGUAGE_IDS;

const isTitleLanguageId = (value: unknown): value is TitleLanguageId =>
  typeof value === 'string' && (TITLE_LANGUAGE_IDS as readonly string[]).includes(value);

const isTitleLanguageArray = (value: unknown): value is TitleLanguageId[] =>
  Array.isArray(value) && value.length > 0 && value.every(isTitleLanguageId);

/**
 * Append any language missing from a stored order. Orders persisted before
 * `russian` existed are 4 entries long; new languages slot in at the end so
 * the user's explicit ranking is preserved.
 */
function normalizeOrder(order: readonly TitleLanguageId[]): TitleLanguageId[] {
  const seen = new Set<TitleLanguageId>();
  const result: TitleLanguageId[] = [];
  for (const id of order) {
    if (!seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }
  for (const id of FALLBACK_ORDER) {
    if (!seen.has(id)) result.push(id);
  }
  return result;
}

/** Default priority for a given app UI language (BCP-47-ish, e.g. 'zh-Hant'). */
export function defaultTitleOrderFor(appLanguage: string): TitleLanguageId[] {
  const lang = (appLanguage || '').toLowerCase();
  if (lang.startsWith('zh')) return ['chinese', 'english', 'romaji', 'japanese', 'russian'];
  if (lang.startsWith('ja')) return ['japanese', 'romaji', 'english', 'chinese', 'russian'];
  if (lang.startsWith('ru')) return ['russian', 'english', 'romaji', 'japanese', 'chinese'];
  return [...FALLBACK_ORDER];
}

/**
 * Raw stored value (or '') — a cheap stable-by-value snapshot for
 * `useSyncExternalStore`, so hooks can memo on it without JSON re-parsing.
 */
export function getStoredTitleOrderRawSync(): string {
  return kvGet(LANGUAGE_PRIORITY_KEY) ?? '';
}

/** The user's explicit order, or null when they follow the app language. */
export function getStoredTitleOrderSync(): TitleLanguageId[] | null {
  const parsed = safeJsonParse(kvGet(LANGUAGE_PRIORITY_KEY), isTitleLanguageArray);
  return parsed ? normalizeOrder(parsed) : null;
}

/** Resolved order: stored custom order if present, else derived from app language. */
export function getEffectiveTitleOrderSync(appLanguage: string): TitleLanguageId[] {
  return getStoredTitleOrderSync() ?? defaultTitleOrderFor(appLanguage);
}

export function setTitleOrder(order: readonly TitleLanguageId[]): void {
  kvSet(LANGUAGE_PRIORITY_KEY, JSON.stringify(normalizeOrder(order)));
  emit();
}

/** Forget the custom order and follow the app language again. */
export function clearTitleOrder(): void {
  kvRemove(LANGUAGE_PRIORITY_KEY);
  emit();
}

// MARK: - Change notification

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeTitleOrder(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(): void {
  for (const listener of listeners) listener();
}
