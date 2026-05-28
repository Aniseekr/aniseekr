// i18n engine unit tests.
//
// These cover:
// - Direct hits in the active catalog.
// - Fallback to English when a key is missing in the active catalog.
// - OpenCC bridging between zh-Hant and zh-Hans for keys that are only in one.
// - Interpolation of {name} placeholders.
// - Catalog shape parity: every non-English locale must mirror keys that
//   exist, with the same primitive type. Missing keys are allowed (they
//   fall back). Extra keys are NOT allowed — they would silently rot.
// - resolveSystemLanguage covers the BCP-47 tags we expect from iOS/Android.

import { describe, expect, test } from 'bun:test';
import en from '../../libs/i18n/locales/en.json';
import ja from '../../libs/i18n/locales/ja.json';
import ko from '../../libs/i18n/locales/ko.json';
import zhHans from '../../libs/i18n/locales/zh-Hans.json';
import zhHant from '../../libs/i18n/locales/zh-Hant.json';
import { resolveSystemLanguage, translate } from '../../libs/i18n/engine';

describe('translate()', () => {
  test('returns the direct hit in the active catalog', () => {
    expect(translate('en', 'common.continue')).toBe('Continue');
    expect(translate('zh-Hant', 'common.continue')).toBe('繼續');
    expect(translate('zh-Hans', 'common.continue')).toBe('继续');
  });

  test('falls back to English for keys missing in a locale', () => {
    // `ja.ts` defines `common.continue` but does NOT define
    // `settings.manageSubscription`. The engine should hand back the
    // English string rather than the raw key.
    expect(translate('ja', 'settings.manageSubscription')).toBe('Manage subscription');
  });

  test('returns the key itself for truly unknown keys (no silent corruption)', () => {
    expect(translate('en', 'nope.does.not.exist')).toBe('nope.does.not.exist');
  });

  test('interpolates {name} placeholders', () => {
    expect(translate('en', 'settings.version', { version: '1.2.3' })).toBe('Version 1.2.3');
    expect(translate('zh-Hant', 'settings.version', { version: '1.2.3' })).toBe('版本 1.2.3');
  });

  test('leaves placeholders untouched when no value is provided', () => {
    expect(translate('en', 'settings.version')).toBe('Version {version}');
  });

  test('zh-Hans borrows from zh-Hant via OpenCC simplification', () => {
    // Anything in zh-Hant that zh-Hans hasn't explicitly redefined must come
    // back simplified, not raw traditional and not English.
    const trad = translate('zh-Hant', 'common.continue');
    const simp = translate('zh-Hans', 'common.continue');
    expect(simp).toBe('继续');
    expect(simp).not.toBe(trad);
    expect(simp).not.toBe('Continue');
  });
});

describe('resolveSystemLanguage()', () => {
  test('maps iOS/Android locale tags to our supported ids', () => {
    expect(resolveSystemLanguage('en')).toBe('en');
    expect(resolveSystemLanguage('en-US')).toBe('en');
    expect(resolveSystemLanguage('en_GB')).toBe('en');
    expect(resolveSystemLanguage('zh-TW')).toBe('zh-Hant');
    expect(resolveSystemLanguage('zh-Hant-TW')).toBe('zh-Hant');
    expect(resolveSystemLanguage('zh-HK')).toBe('zh-Hant');
    expect(resolveSystemLanguage('zh-CN')).toBe('zh-Hans');
    expect(resolveSystemLanguage('zh-Hans-CN')).toBe('zh-Hans');
    expect(resolveSystemLanguage('zh-SG')).toBe('zh-Hans');
    expect(resolveSystemLanguage('ja-JP')).toBe('ja');
    expect(resolveSystemLanguage('ko-KR')).toBe('ko');
  });

  test('defaults bare "zh" to Traditional (project default Chinese)', () => {
    expect(resolveSystemLanguage('zh')).toBe('zh-Hant');
  });

  test('falls back to English for unsupported / missing tags', () => {
    expect(resolveSystemLanguage('fr-FR')).toBe('en');
    expect(resolveSystemLanguage('')).toBe('en');
    expect(resolveSystemLanguage(null)).toBe('en');
  });
});

describe('catalog parity', () => {
  // Walk the English catalog and confirm that wherever another locale has
  // defined a key, the *shape* matches: same kind of primitive, same nesting.
  // Missing keys are fine; mismatched shapes would crash at runtime.
  function comparePaths(reference: unknown, candidate: unknown, path: string[]): string[] {
    const errors: string[] = [];
    if (candidate == null) return errors;
    if (typeof reference === 'string') {
      if (typeof candidate !== 'string') {
        errors.push(`${path.join('.')}: expected string, got ${typeof candidate}`);
      }
      return errors;
    }
    if (typeof reference !== 'object') return errors;
    if (typeof candidate !== 'object' || Array.isArray(candidate)) {
      errors.push(`${path.join('.')}: expected object, got ${typeof candidate}`);
      return errors;
    }
    const refKeys = new Set(Object.keys(reference as Record<string, unknown>));
    for (const key of Object.keys(candidate as Record<string, unknown>)) {
      if (!refKeys.has(key)) {
        errors.push(`${[...path, key].join('.')}: stale key (not in English catalog)`);
        continue;
      }
      errors.push(
        ...comparePaths(
          (reference as Record<string, unknown>)[key],
          (candidate as Record<string, unknown>)[key],
          [...path, key]
        )
      );
    }
    return errors;
  }

  test('zh-Hant has no stale keys and no shape drift', () => {
    expect(comparePaths(en, zhHant, [])).toEqual([]);
  });

  test('zh-Hans has no stale keys and no shape drift', () => {
    expect(comparePaths(en, zhHans, [])).toEqual([]);
  });

  test('ja has no stale keys and no shape drift', () => {
    expect(comparePaths(en, ja, [])).toEqual([]);
  });

  test('ko has no stale keys and no shape drift', () => {
    expect(comparePaths(en, ko, [])).toEqual([]);
  });
});
