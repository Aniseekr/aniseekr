// Title-keyed matching against Bangumi v0 subjects, shared by the pilgrimage
// search fallback and the collection → bangumi-id online resolver.
//
// The resolver exists because the two offline id layers (the daily-built
// cross-index and the merged id_mappings table) lag behind newly-aired anime.
// When a collected anime misses both, we search Bangumi by title — but a
// keyword search can return adjacent works (sequels, manga, same-franchise
// spin-offs), so acceptance is strict: a candidate only counts as "this anime"
// when one of its names equals one of our known titles after normalization.
// No fuzzy scoring — a wrong match would pin another anime's pilgrimage spots
// onto the user's collection entry (CLAUDE.md Rule 8 territory).

import type { BangumiV0Subject } from '../../clients/bangumi-client';

/**
 * Collapse a title to a comparison key: NFKC (full/half width), lowercase,
 * brackets + common punctuation + whitespace stripped. Identical to the
 * pilgrimage search scorer's normalization so the two features agree on what
 * "the same title" means.
 */
export function normalizeTitleKey(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[『』「」《》【】()[\]（）]/g, '')
    .replace(/[!！?？:：,，.。'’"“”・\-_–—\s　]+/g, '')
    .trim();
}

/**
 * Pick the first anime-typed candidate whose `name` or `name_cn` exactly
 * equals (post-normalization) one of `titles`. Returns `null` when nothing
 * matches — callers must treat that as "not found", never fall back to the
 * top search hit.
 */
export function pickBangumiSubjectByTitle(
  candidates: readonly BangumiV0Subject[],
  titles: readonly string[]
): BangumiV0Subject | null {
  const keys = new Set(titles.map(normalizeTitleKey).filter((key) => key.length > 0));
  if (keys.size === 0) return null;

  for (const candidate of candidates) {
    // type 2 = anime; tolerate payloads that omit `type` (search is already
    // filtered server-side to type 2).
    if (candidate.type !== undefined && candidate.type !== 2) continue;
    if (typeof candidate.id !== 'number' || !Number.isFinite(candidate.id) || candidate.id <= 0) {
      continue;
    }
    const name = normalizeTitleKey(candidate.name ?? '');
    if (name && keys.has(name)) return candidate;
    const nameCn = normalizeTitleKey(candidate.name_cn ?? '');
    if (nameCn && keys.has(nameCn)) return candidate;
  }
  return null;
}
