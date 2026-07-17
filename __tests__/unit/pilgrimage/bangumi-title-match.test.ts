// Tests for the strict title matcher behind the collection → bangumi-id
// online resolver. The matcher must only accept exact normalized equality —
// a fuzzy hit would pin another anime's pilgrimage spots onto the user's
// collection entry.

import { describe, expect, it } from 'bun:test';
import {
  normalizeTitleKey,
  pickBangumiSubjectByTitle,
} from '../../../libs/services/pilgrimage/bangumi-title-match';
import type { BangumiV0Subject } from '../../../libs/clients/bangumi-client';

const subject = (overrides: Partial<BangumiV0Subject> = {}): BangumiV0Subject => ({
  id: overrides.id ?? 100,
  type: overrides.type ?? 2,
  name: overrides.name ?? '',
  name_cn: overrides.name_cn ?? '',
  ...overrides,
});

describe('normalizeTitleKey', () => {
  it('folds width, case, punctuation, brackets and whitespace', () => {
    expect(normalizeTitleKey('ぼっち・ざ・ろっく!')).toBe('ぼっちざろっく');
    expect(normalizeTitleKey('Ｂｏｃｃｈｉ　ｔｈｅ　Ｒｏｃｋ！')).toBe('bocchitherock');
    expect(normalizeTitleKey('『氷菓』')).toBe('氷菓');
    expect(normalizeTitleKey('Yuru Camp△ SEASON 2')).toBe('yurucamp△season2');
  });

  it('returns empty string for punctuation-only input', () => {
    expect(normalizeTitleKey('!?・—')).toBe('');
  });

  it('folds Traditional and Simplified Chinese to the same key', () => {
    expect(normalizeTitleKey('輕音少女')).toBe(normalizeTitleKey('轻音少女'));
  });
});

describe('pickBangumiSubjectByTitle', () => {
  it('matches on normalized Japanese name', () => {
    const match = pickBangumiSubjectByTitle(
      [subject({ id: 1, name: 'mono' }), subject({ id: 2, name: 'もののがたり' })],
      ['MONO']
    );
    expect(match?.id).toBe(1);
  });

  it('matches on normalized Chinese name', () => {
    const match = pickBangumiSubjectByTitle(
      [subject({ id: 3, name: '葬送のフリーレン', name_cn: '葬送的芙莉莲' })],
      ['葬送的芙莉莲']
    );
    expect(match?.id).toBe(3);
  });

  it('does NOT fuzzy-match prefixes or supersets', () => {
    const match = pickBangumiSubjectByTitle(
      [subject({ id: 4, name: 'ゆるキャン△ SEASON2' })],
      ['ゆるキャン△']
    );
    expect(match).toBeNull();
  });

  it('skips non-anime subject types', () => {
    const match = pickBangumiSubjectByTitle(
      [subject({ id: 5, type: 1, name: 'mono' }), subject({ id: 6, type: 2, name: 'mono' })],
      ['mono']
    );
    expect(match?.id).toBe(6);
  });

  it('tolerates payloads that omit type (server-side filtered)', () => {
    const match = pickBangumiSubjectByTitle(
      [subject({ id: 7, type: undefined, name: 'mono' })],
      ['mono']
    );
    expect(match?.id).toBe(7);
  });

  it('skips invalid subject ids', () => {
    const match = pickBangumiSubjectByTitle(
      [subject({ id: 0, name: 'mono' }), subject({ id: -1, name: 'mono' })],
      ['mono']
    );
    expect(match).toBeNull();
  });

  it('returns null for empty titles or empty candidates', () => {
    expect(pickBangumiSubjectByTitle([subject({ name: 'mono' })], [])).toBeNull();
    expect(pickBangumiSubjectByTitle([subject({ name: 'mono' })], ['!?'])).toBeNull();
    expect(pickBangumiSubjectByTitle([], ['mono'])).toBeNull();
  });
});
