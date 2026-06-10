// maskUri round-trips through serialize/parse, and updateEntryCutout patches
// a single entry without disturbing the rest of the list.

import { describe, expect, test } from 'bun:test';
import {
  parseLibraryFromJson,
  serializeLibraryToJson,
  updateEntryCutout,
  type CharacterEntry,
} from '../../libs/services/companion/character-library';

function entry(id: string, extra: Partial<CharacterEntry> = {}): CharacterEntry {
  return {
    id,
    displayName: id,
    sourceUri: `file:///src-${id}.jpg`,
    cutoutUri: `file:///cut-${id}.png`,
    thumbUri: `file:///cut-${id}.png`,
    intrinsicW: 100,
    intrinsicH: 200,
    createdAt: 1,
    ...extra,
  };
}

describe('maskUri persistence', () => {
  test('round-trips through serialize/parse', () => {
    const list = [entry('a', { maskUri: 'file:///mask-a.png', hasAlpha: true })];
    const parsed = parseLibraryFromJson(serializeLibraryToJson(list));
    expect(parsed).toHaveLength(1);
    expect(parsed[0].maskUri).toBe('file:///mask-a.png');
  });

  test('entries without maskUri parse fine (legacy)', () => {
    const parsed = parseLibraryFromJson(serializeLibraryToJson([entry('a')]));
    expect(parsed).toHaveLength(1);
    expect(parsed[0].maskUri).toBeUndefined();
  });

  test('non-string maskUri is dropped, entry kept', () => {
    const raw = JSON.stringify([{ ...entry('a'), maskUri: 42 }]);
    const parsed = parseLibraryFromJson(raw);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].maskUri).toBeUndefined();
  });
});

describe('updateEntryCutout', () => {
  test('patches the matching entry', () => {
    const list = [entry('a'), entry('b')];
    const next = updateEntryCutout(list, 'b', {
      cutoutUri: 'file:///new.png',
      thumbUri: 'file:///new.png',
      intrinsicW: 50,
      intrinsicH: 60,
      hasAlpha: true,
      maskUri: 'file:///m.png',
    });
    expect(next).not.toBe(list);
    expect(next[1].cutoutUri).toBe('file:///new.png');
    expect(next[1].maskUri).toBe('file:///m.png');
    expect(next[1].displayName).toBe('b');
    expect(next[0]).toBe(list[0]);
  });

  test('returns the same reference when the id is missing', () => {
    const list = [entry('a')];
    expect(
      updateEntryCutout(list, 'zzz', {
        cutoutUri: 'x',
        thumbUri: 'x',
        intrinsicW: 1,
        intrinsicH: 1,
        hasAlpha: false,
      })
    ).toBe(list);
  });
});
