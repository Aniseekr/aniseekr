// Track D Phase 1 (Companion composer) — character library + subject lifter.
// MMKV is mocked at test-setup; the library reducer + subject-lifter fallback
// are pure JS so we can unit-test them without a renderer.

import { describe, expect, it } from 'bun:test';
import {
  CHARACTER_LIBRARY_FREE_LIMIT,
  addCharacter,
  parseLibraryFromJson,
  removeCharacter,
  serializeLibraryToJson,
  type CharacterEntry,
} from '../../../libs/services/companion/character-library';
import { jsSubjectLifter } from '../../../libs/services/companion/subject-lifter';
import {
  DEFAULT_SHADOW,
  IDENTITY_CHARACTER_TINT,
  deriveCharacterTint,
  getShadowEllipse,
} from '../../../libs/services/companion/character-lighting';

function mkChar(id: string, overrides: Partial<CharacterEntry> = {}): CharacterEntry {
  return {
    id,
    displayName: `Char ${id}`,
    sourceUri: `file:///source/${id}.png`,
    cutoutUri: `file:///cutout/${id}.png`,
    thumbUri: `file:///thumb/${id}.png`,
    intrinsicW: 512,
    intrinsicH: 768,
    createdAt: 1_700_000_000_000,
    ...overrides,
  };
}

describe('character library · add / remove', () => {
  it('adds a new entry to the front of the list', () => {
    const { list, rejected } = addCharacter([], mkChar('a'), CHARACTER_LIBRARY_FREE_LIMIT);
    expect(rejected).toBe(false);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('a');
  });

  it('keeps entries sorted by createdAt desc (newest first)', () => {
    const earlier = mkChar('a', { createdAt: 1_000 });
    const later = mkChar('b', { createdAt: 2_000 });
    const after1 = addCharacter([], earlier, 10).list;
    const after2 = addCharacter(after1, later, 10).list;
    expect(after2.map((c) => c.id)).toEqual(['b', 'a']);
  });

  it('replaces an existing entry when its id matches (re-import)', () => {
    const list1 = addCharacter([], mkChar('a', { displayName: 'Old' }), 10).list;
    const list2 = addCharacter(list1, mkChar('a', { displayName: 'New' }), 10).list;
    expect(list2).toHaveLength(1);
    expect(list2[0].displayName).toBe('New');
  });

  it('rejects when the free limit is reached', () => {
    const limit = 3;
    let list: CharacterEntry[] = [];
    for (let i = 0; i < limit; i++) {
      list = addCharacter(list, mkChar(String(i)), limit).list;
    }
    const result = addCharacter(list, mkChar('overflow'), limit);
    expect(result.rejected).toBe(true);
    expect(result.list).toHaveLength(limit);
    expect(result.list.find((c) => c.id === 'overflow')).toBeUndefined();
  });

  it('removeCharacter returns a list without the matching id', () => {
    const list = [mkChar('a'), mkChar('b'), mkChar('c')];
    const after = removeCharacter(list, 'b');
    expect(after.map((c) => c.id)).toEqual(['a', 'c']);
  });

  it('removeCharacter is a no-op for an unknown id', () => {
    const list = [mkChar('a')];
    expect(removeCharacter(list, 'nope')).toEqual(list);
  });
});

describe('character library · serialization', () => {
  it('round-trips through JSON', () => {
    const list = [mkChar('a'), mkChar('b', { displayName: '空 Ūn' })];
    const json = serializeLibraryToJson(list);
    const back = parseLibraryFromJson(json);
    expect(back).toEqual(list);
  });

  it('parseLibraryFromJson returns [] for malformed input (no fake data)', () => {
    expect(parseLibraryFromJson('')).toEqual([]);
    expect(parseLibraryFromJson('not-json')).toEqual([]);
    expect(parseLibraryFromJson('null')).toEqual([]);
    expect(parseLibraryFromJson('{"x":1}')).toEqual([]);
  });

  it('parseLibraryFromJson drops entries missing required fields', () => {
    const partial = JSON.stringify([
      { id: 'ok', displayName: 'OK', sourceUri: 's', cutoutUri: 'c', thumbUri: 't', intrinsicW: 1, intrinsicH: 1, createdAt: 1 },
      { id: 'bad' }, // missing fields
    ]);
    const back = parseLibraryFromJson(partial);
    expect(back).toHaveLength(1);
    expect(back[0].id).toBe('ok');
  });
});

describe('character lighting · Phase 2', () => {
  it('IDENTITY_CHARACTER_TINT is the no-op 4×5 matrix', () => {
    expect(IDENTITY_CHARACTER_TINT).toHaveLength(20);
    expect(IDENTITY_CHARACTER_TINT[0]).toBe(1);
    expect(IDENTITY_CHARACTER_TINT[6]).toBe(1);
    expect(IDENTITY_CHARACTER_TINT[12]).toBe(1);
  });

  it('deriveCharacterTint returns identity when bg or char analysis is null', () => {
    expect(deriveCharacterTint(null, { avgR: 100, avgG: 100, avgB: 100 })).toEqual(
      IDENTITY_CHARACTER_TINT
    );
    expect(deriveCharacterTint({ avgR: 100, avgG: 100, avgB: 100 }, null)).toEqual(
      IDENTITY_CHARACTER_TINT
    );
  });

  it('deriveCharacterTint pulls the character toward the bg palette but stays gentle (≤ 1.5×)', () => {
    const m = deriveCharacterTint(
      { avgR: 200, avgG: 150, avgB: 100 },
      { avgR: 100, avgG: 100, avgB: 100 }
    );
    // Even though raw ratio would be 2×, the lerp toward identity keeps it tame.
    expect(m[0]).toBeLessThanOrEqual(1.5);
    expect(m[0]).toBeGreaterThan(1.0);
  });

  it('deriveCharacterTint intensity 0 collapses to identity', () => {
    const m = deriveCharacterTint(
      { avgR: 200, avgG: 100, avgB: 50 },
      { avgR: 50, avgG: 100, avgB: 200 },
      0
    );
    expect(m).toEqual(IDENTITY_CHARACTER_TINT);
  });

  it('DEFAULT_SHADOW has sane initial intensity + offset', () => {
    expect(DEFAULT_SHADOW.intensity).toBeGreaterThan(0);
    expect(DEFAULT_SHADOW.intensity).toBeLessThanOrEqual(1);
    expect(DEFAULT_SHADOW.softness).toBeGreaterThanOrEqual(0);
  });

  it('getShadowEllipse computes cx/cy/rx/ry in character-local coords', () => {
    const e = getShadowEllipse(120, 240, DEFAULT_SHADOW);
    // Foot shadow horizontally centred near the bottom of the character.
    expect(e.cx).toBeCloseTo(60, 1);
    expect(e.cy).toBeGreaterThan(180); // below mid-line
    expect(e.rx).toBeGreaterThan(0);
    expect(e.ry).toBeGreaterThan(0);
  });
});

describe('subject lifter · JS fallback', () => {
  it('reports unsupported so the UI can offer a manual mask workflow later', () => {
    expect(jsSubjectLifter.isSupported()).toBe(false);
  });

  it('passes the image URI straight through (no background removal in fallback)', async () => {
    const result = await jsSubjectLifter.lift('file:///input.png');
    expect(result.uri).toBe('file:///input.png');
    expect(result.hasAlpha).toBe(false); // JS fallback doesn't probe pixels
  });

  it('throws if asked to lift a missing/empty URI — refuses to invent data', async () => {
    await expect(jsSubjectLifter.lift('')).rejects.toBeInstanceOf(Error);
  });
});
