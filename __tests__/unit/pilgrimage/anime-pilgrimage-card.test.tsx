// Component tests for AnimePilgrimageCard.
// Spec cases: PILG-005, PILG-006, PILG-007, PILG-008.
//
// We don't have react-test-renderer available; instead the component is
// invoked through a tiny tree walker (./render-helpers) that lets us assert
// on the React.createElement output.

import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';
import * as React from 'react';
import * as Haptics from 'expo-haptics';
import en from '../../../libs/i18n/locales/en.json';
import type { AnitabiBangumi } from '../../../libs/services/pilgrimage/types';
import { findAll, getAllText, render } from './render-helpers';

const tEn = (key: string): string =>
  (key
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined,
      en
    ) as string) ?? key;

mock.module('../../../libs/i18n', () => ({ useT: () => tEn }));

mock.module('../../../context/ThemeContext', () => ({
  useTheme: () => ({
    theme: {
      accent: '#FF9900',
      accentLight: '#FFB84D',
      accentDark: '#CC7A00',
      secondary: '#00BCD4',
      background: {
        primary: '#0A1929',
        secondary: '#102033',
        tertiary: '#172A44',
      },
      text: {
        primary: '#FFFFFF',
        secondary: '#D6DFEA',
        tertiary: '#A7B4C4',
      },
      glassBorder: 'rgba(255,255,255,0.16)',
      gradient: ['#0A1929', '#102033'],
      status: {
        success: '#32D74B',
        warning: '#FFD60A',
        error: '#FF453A',
        info: '#64D2FF',
      },
    },
  }),
}));

// SpotImage owns local `useState` for its load-failure fallback (CLAUDE.md
// Rule 8's honest error tile). The render-helpers tree walker calls function
// components directly with no fiber/dispatcher, so a real stateful hook
// throws "Invalid hook call" here — stub the component to a plain host node.
// `mock.module` is process-global in bun and outlives this file's `afterEach`,
// so this factory also re-exports a spec-faithful `sanitizeImageUri` (kept in
// sync with SpotImage.tsx) — otherwise a later test file that imports the
// real named export (spot-image.test.ts) would break when the whole suite
// runs and picks up this leaked mock instead of the real module.
mock.module('../../../components/pilgrimage/SpotImage', () => ({
  sanitizeImageUri: (uri: string | null | undefined): string | null => {
    if (typeof uri !== 'string') return null;
    const trimmed = uri.trim();
    return /^(https?|file):\/\//.test(trimmed) ? trimmed : null;
  },
  SpotImage: ({ uri, style, contentFit }: { uri?: string | null; style?: unknown; contentFit?: unknown }) =>
    React.createElement('Image', { source: { uri }, style, contentFit }),
}));

const { AnimePilgrimageCard } = await import(
  '../../../components/pilgrimage/AnimePilgrimageCard'
);

const sampleAnime: AnitabiBangumi = {
  id: 7157,
  cn: '冰菓',
  title: '氷菓',
  city: '岐阜県',
  cover: 'https://image.anitabi.cn/posters/7157.jpg?plan=h160',
  color: '#8DC5D8',
  geo: [35.5, 136.9],
  zoom: 12,
  modified: 1_700_000_000,
  litePoints: [
    { id: 'p1', name: 'Spot A', image: 'https://img/1.jpg', ep: 1, s: 30, geo: [35.51, 136.91] },
    { id: 'p2', name: 'Spot B', image: 'https://img/2.jpg', ep: 2, s: 60, geo: [35.52, 136.92] },
    { id: 'p3', name: 'Spot C', image: 'https://img/3.jpg', ep: 3, s: 90, geo: [35.53, 136.93] },
    { id: 'p4', name: 'Spot D', image: 'https://img/4.jpg', ep: 4, s: 120, geo: [35.54, 136.94] },
  ],
  pointsLength: 12,
  imagesLength: 24,
};

afterEach(() => {
  mock.restore();
});

describe('AnimePilgrimageCard', () => {
  it('PILG-005 renders title, Chinese name, city tag and spots count', () => {
    const tree = render(AnimePilgrimageCard, { anime: sampleAnime });
    const text = getAllText(tree);
    const concat = text.join('');
    expect(concat).toContain('氷菓');
    expect(concat).toContain('冰菓');
    expect(concat).toContain('岐阜県');
    // pointsLength rendered next to the literal "spots".
    expect(concat).toContain('12 spots');
    // 4 lite points but card only shows 3 thumbs → "+N" overlay shows
    // pointsLength - 3 = 9.
    expect(concat).toContain('+9');
  });

  it('PILG-006 omits the distance badge when the prop is not supplied', () => {
    const noDistance = render(AnimePilgrimageCard, { anime: sampleAnime });
    const noDistText = getAllText(noDistance).join('');
    expect(/(\d+(\.\d+)?(km|m))(?!\d)/.test(noDistText)).toBe(false);

    const withDistance = render(AnimePilgrimageCard, {
      anime: sampleAnime,
      distance: 2.5,
    });
    const withDistText = getAllText(withDistance).join('');
    expect(withDistText).toContain('2.5km');
  });

  it('PILG-007 invokes onPress with the full anime object', () => {
    const calls: AnitabiBangumi[] = [];
    const tree = render(AnimePilgrimageCard, {
      anime: sampleAnime,
      onPress: (a) => calls.push(a),
    });

    // Find the outer Pressable and trigger its handler.
    const pressables = findAll(tree, (n) => n.type === 'Pressable');
    expect(pressables.length).toBeGreaterThan(0);
    const handler = pressables[0].props.onPress as () => void;
    expect(typeof handler).toBe('function');
    handler();

    expect(calls).toHaveLength(1);
    expect(calls[0]).toBe(sampleAnime);
  });

  it('PILG-008 calls Haptics.impactAsync on press', () => {
    const haptic = spyOn(Haptics, 'impactAsync').mockResolvedValue(undefined as never);
    const tree = render(AnimePilgrimageCard, { anime: sampleAnime });
    const pressables = findAll(tree, (n) => n.type === 'Pressable');
    (pressables[0].props.onPress as () => void)();
    expect(haptic).toHaveBeenCalledTimes(1);
    haptic.mockRestore();
  });
});
