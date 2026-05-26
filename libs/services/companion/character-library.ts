// Companion composer (Track D Phase 1) — character library reducer.
//
// The companion feature lets the user import a character image (ideally with
// alpha) and place it on top of a background as a Skia overlay. This file
// owns the *data* shape and pure add/remove/serialize logic. The MMKV-backed
// store wraps these helpers in companion/character-library-store.ts so the
// reducer can be unit-tested without touching native code.
//
// Per the plan:
//   - schema: { id, displayName, sourceUri, cutoutUri, thumbUri, intrinsicW/H, createdAt }
//   - free quota: 20 entries (cutout pngs live on FileSystem, MMKV only holds
//     metadata so the storage cost stays bounded)

export type CharacterEntry = {
  id: string;
  displayName: string;
  sourceUri: string;
  cutoutUri: string;
  thumbUri: string;
  intrinsicW: number;
  intrinsicH: number;
  createdAt: number;
};

export const CHARACTER_LIBRARY_FREE_LIMIT = 20;

export type AddCharacterResult = {
  list: CharacterEntry[];
  rejected: boolean;
};

/**
 * Add (or replace by id) a character entry. If the list is full and the id
 * is new, the request is rejected — the caller surfaces "Library full" so
 * users delete an entry before importing more. Re-imports of an existing id
 * always go through (treated as an update).
 */
export function addCharacter(
  list: CharacterEntry[],
  char: CharacterEntry,
  freeLimit: number
): AddCharacterResult {
  const idx = list.findIndex((c) => c.id === char.id);
  if (idx >= 0) {
    const next = list.slice();
    next[idx] = char;
    return { list: sortByCreatedAtDesc(next), rejected: false };
  }
  if (list.length >= freeLimit) {
    return { list, rejected: true };
  }
  return { list: sortByCreatedAtDesc([...list, char]), rejected: false };
}

export function removeCharacter(list: CharacterEntry[], id: string): CharacterEntry[] {
  return list.filter((c) => c.id !== id);
}

function sortByCreatedAtDesc(list: CharacterEntry[]): CharacterEntry[] {
  return list.slice().sort((a, b) => b.createdAt - a.createdAt);
}

export function serializeLibraryToJson(list: CharacterEntry[]): string {
  return JSON.stringify(list);
}

const REQUIRED_KEYS: (keyof CharacterEntry)[] = [
  'id',
  'displayName',
  'sourceUri',
  'cutoutUri',
  'thumbUri',
  'intrinsicW',
  'intrinsicH',
  'createdAt',
];

/**
 * Defensive parser — drops anything that isn't a complete `CharacterEntry`
 * shape. We'd rather show a smaller library than a half-broken row.
 */
export function parseLibraryFromJson(raw: string | null | undefined): CharacterEntry[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: CharacterEntry[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const candidate = item as Record<string, unknown>;
    if (!REQUIRED_KEYS.every((k) => k in candidate)) continue;
    if (typeof candidate.id !== 'string') continue;
    if (typeof candidate.displayName !== 'string') continue;
    if (typeof candidate.sourceUri !== 'string') continue;
    if (typeof candidate.cutoutUri !== 'string') continue;
    if (typeof candidate.thumbUri !== 'string') continue;
    if (typeof candidate.intrinsicW !== 'number') continue;
    if (typeof candidate.intrinsicH !== 'number') continue;
    if (typeof candidate.createdAt !== 'number') continue;
    out.push({
      id: candidate.id,
      displayName: candidate.displayName,
      sourceUri: candidate.sourceUri,
      cutoutUri: candidate.cutoutUri,
      thumbUri: candidate.thumbUri,
      intrinsicW: candidate.intrinsicW,
      intrinsicH: candidate.intrinsicH,
      createdAt: candidate.createdAt,
    });
  }
  return out;
}
