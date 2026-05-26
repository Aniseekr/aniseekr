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
