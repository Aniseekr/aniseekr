import { beforeEach, describe, expect, it } from 'bun:test';
import {
  clearTitleOrder,
  defaultTitleOrderFor,
  getEffectiveTitleOrderSync,
  getStoredTitleOrderSync,
  setTitleOrder,
  subscribeTitleOrder,
} from '../../libs/i18n/title-language';
import { kvRemove, kvSet } from '../../libs/services/storage/app-storage';
import { LANGUAGE_PRIORITY_KEY } from '../../libs/services/storage/keys';

describe('title-language', () => {
  beforeEach(() => {
    kvRemove(LANGUAGE_PRIORITY_KEY);
  });

  it('TL-001 derives the default order from the app UI language', () => {
    expect(defaultTitleOrderFor('zh-Hant')[0]).toBe('chinese');
    expect(defaultTitleOrderFor('zh-Hans')[0]).toBe('chinese');
    expect(defaultTitleOrderFor('ja')[0]).toBe('japanese');
    expect(defaultTitleOrderFor('ru')[0]).toBe('russian');
    expect(defaultTitleOrderFor('en')[0]).toBe('english');
    expect(defaultTitleOrderFor('ko')[0]).toBe('english');
    expect(defaultTitleOrderFor('')[0]).toBe('english');
  });

  it('TL-002 every default order contains all five languages exactly once', () => {
    for (const lang of ['zh-Hant', 'ja', 'ru', 'en']) {
      const order = defaultTitleOrderFor(lang);
      expect([...order].sort().join(',')).toBe('chinese,english,japanese,romaji,russian');
    }
  });

  it('TL-003 effective order follows app language until a custom order is stored', () => {
    expect(getStoredTitleOrderSync()).toBeNull();
    expect(getEffectiveTitleOrderSync('zh-Hant')[0]).toBe('chinese');

    setTitleOrder(['japanese', 'english', 'romaji', 'chinese', 'russian']);
    expect(getEffectiveTitleOrderSync('zh-Hant')[0]).toBe('japanese');

    clearTitleOrder();
    expect(getEffectiveTitleOrderSync('zh-Hant')[0]).toBe('chinese');
  });

  it('TL-004 normalizes legacy 4-language stored orders by appending russian', () => {
    // Orders persisted before the russian option existed.
    kvSet(LANGUAGE_PRIORITY_KEY, JSON.stringify(['chinese', 'english', 'romaji', 'japanese']));
    expect(getStoredTitleOrderSync()).toEqual([
      'chinese',
      'english',
      'romaji',
      'japanese',
      'russian',
    ]);
  });

  it('TL-005 rejects malformed stored values and falls back to language default', () => {
    kvSet(LANGUAGE_PRIORITY_KEY, 'not json');
    expect(getStoredTitleOrderSync()).toBeNull();
    kvSet(LANGUAGE_PRIORITY_KEY, JSON.stringify(['klingon']));
    expect(getStoredTitleOrderSync()).toBeNull();
    expect(getEffectiveTitleOrderSync('ja')[0]).toBe('japanese');
  });

  it('TL-006 notifies subscribers on set and clear', () => {
    let calls = 0;
    const unsubscribe = subscribeTitleOrder(() => {
      calls += 1;
    });
    setTitleOrder(['english', 'romaji', 'japanese', 'chinese', 'russian']);
    clearTitleOrder();
    unsubscribe();
    setTitleOrder(['english', 'romaji', 'japanese', 'chinese', 'russian']);
    expect(calls).toBe(2);
  });
});
