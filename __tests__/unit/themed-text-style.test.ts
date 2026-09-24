import { describe, expect, it } from 'bun:test';
import { StyleSheet, type TextStyle } from 'react-native';
import { CAPS_TRACKING, Typography } from '../../constants/DesignSystem';
import {
  capsTextStyle,
  composeThemedTextStyle,
  resolveThemedTextStyles,
} from '../../components/themed/text-style';
import { capsTracking, containsCjk, isCjkLabel, isCjkLanguage } from '../../libs/i18n/script';

const flat = (style: unknown): TextStyle => StyleSheet.flatten(style as TextStyle) ?? {};

describe('composeThemedTextStyle', () => {
  it('keeps the variant weight when no weight prop is given', () => {
    const style = composeThemedTextStyle({ variant: 'headlineLarge', color: '#fff', cjk: false });
    expect(style.fontWeight).toBe(Typography.headlineLarge.fontWeight);
    // A caller style layered on top must not be able to lose the weight either.
    expect(flat([style, { color: '#000' }]).fontWeight).toBe('700');
  });

  it('applies an explicit weight and alignment over the variant', () => {
    const style = composeThemedTextStyle({
      variant: 'bodyMedium',
      color: '#fff',
      weight: '800',
      align: 'center',
      cjk: false,
    });
    expect(style.fontWeight).toBe('800');
    expect(style.textAlign).toBe('center');
  });

  it('never emits undefined overrides for weight or alignment', () => {
    const style = composeThemedTextStyle({ variant: 'titleLarge', color: '#fff', cjk: false });
    expect(Object.values(style).includes(undefined)).toBe(false);
    expect('textAlign' in style).toBe(false);
  });

  it('drops overline caps tracking for CJK labels only', () => {
    const latin = composeThemedTextStyle({ variant: 'overline', color: '#fff', cjk: false });
    const cjk = composeThemedTextStyle({ variant: 'overline', color: '#fff', cjk: true });
    expect(latin.letterSpacing).toBe(CAPS_TRACKING);
    expect(cjk.letterSpacing).toBe(0);
  });

  it('leaves tracking unset on text tiers so the platform face tracks itself', () => {
    const style = composeThemedTextStyle({ variant: 'bodyLarge', color: '#fff', cjk: false });
    expect('letterSpacing' in style).toBe(false);
  });
});

describe('resolveThemedTextStyles (caller caps styles)', () => {
  const caps: TextStyle = { letterSpacing: 1.2, textTransform: 'uppercase' };

  it('resets tracking for a CJK label with an uppercase caller style', () => {
    const style = resolveThemedTextStyles({
      variant: 'captionSmall',
      color: '#fff',
      cjk: true,
      style: caps,
    });
    expect(flat(style).letterSpacing).toBe(0);
  });

  it('keeps caller tracking for Latin labels', () => {
    const style = resolveThemedTextStyles({
      variant: 'captionSmall',
      color: '#fff',
      cjk: false,
      style: caps,
    });
    expect(flat(style).letterSpacing).toBe(1.2);
  });

  it('keeps caller tracking on CJK text that is not a caps label', () => {
    const style = resolveThemedTextStyles({
      variant: 'captionSmall',
      color: '#fff',
      cjk: true,
      style: { letterSpacing: 0.5 },
    });
    expect(flat(style).letterSpacing).toBe(0.5);
  });
});

describe('capsTextStyle', () => {
  it('resets tracking for CJK text and passes Latin styles through', () => {
    const style = { letterSpacing: 1, textTransform: 'uppercase' as const };
    expect(flat(capsTextStyle(style, true)).letterSpacing).toBe(0);
    expect(capsTextStyle(style, false)).toBe(style);
  });
});

describe('CJK detection', () => {
  it('maps every CJK UI language to zero caps tracking', () => {
    for (const lang of ['zh-Hant', 'zh-Hans', 'ja', 'ko'] as const) {
      expect(isCjkLanguage(lang)).toBe(true);
      expect(capsTracking(lang, 1.2)).toBe(0);
    }
    expect(isCjkLanguage('en')).toBe(false);
    expect(capsTracking('en', 1.2)).toBe(1.2);
  });

  it('decides plain-text labels by their content, not the UI language', () => {
    expect(isCjkLabel('PRO', 'zh-Hant')).toBe(false);
    expect(isCjkLabel('聖地巡禮', 'en')).toBe(true);
    expect(isCjkLabel(['12', ' ', '件'], 'en')).toBe(true);
    expect(isCjkLabel(42, 'ja')).toBe(false);
    expect(containsCjk('ゆるキャン△')).toBe(true);
    expect(containsCjk('한국어')).toBe(true);
  });

  it('falls back to the UI language when children are elements', () => {
    const element = { type: 'Text', props: {}, key: null };
    expect(isCjkLabel(element as never, 'zh-Hant')).toBe(true);
    expect(isCjkLabel(element as never, 'en')).toBe(false);
  });
});
