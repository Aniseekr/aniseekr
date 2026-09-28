// The display face is a bundled font: the name in DesignSystem must be the
// family the expo-font config plugin registers on both platforms, with a file
// for every weight the display tiers ask for. A mismatch doesn't crash — it
// silently falls back to the system face — so it's pinned here instead.
import { describe, expect, it } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import appJson from '../../app.json';
import { FontFamily, Typography } from '../../constants/DesignSystem';

type FontDefinition = { path: string; weight: number };
type FontPluginConfig = {
  ios?: { fonts?: string[] };
  android?: { fonts?: { fontFamily: string; fontDefinitions: FontDefinition[] }[] };
};

function fontPlugin(): FontPluginConfig {
  const entry = (appJson.expo.plugins as unknown[]).find(
    (p): p is [string, FontPluginConfig] => Array.isArray(p) && p[0] === 'expo-font'
  );
  if (!entry) throw new Error('expo-font plugin is not configured with fonts');
  return entry[1];
}

const DISPLAY_TIERS = [
  'displayLarge',
  'displayMedium',
  'headlineLarge',
  'headlineMedium',
  'headlineSmall',
] as const;

describe('bundled display font', () => {
  it('display and headline tiers use the bundled face; body tiers stay on the system face', () => {
    expect(FontFamily.display).toBe('Nunito');
    for (const tier of DISPLAY_TIERS) {
      expect((Typography[tier] as { fontFamily?: string }).fontFamily).toBe(FontFamily.display);
    }
    expect('fontFamily' in Typography.bodyMedium).toBe(false);
    expect('fontFamily' in Typography.titleLarge).toBe(false);
  });

  it('Android registers the same family with a file for every display weight', () => {
    const android = fontPlugin().android?.fonts ?? [];
    const family = android.find((f) => f.fontFamily === FontFamily.display);
    expect(family).toBeDefined();
    const weights = new Set(family!.fontDefinitions.map((d) => d.weight));
    for (const tier of DISPLAY_TIERS) {
      expect(weights.has(Number(Typography[tier].fontWeight))).toBe(true);
    }
    // Direct `FontFamily.display` users ask for 400–800 too.
    for (const weight of [400, 600, 700, 800]) expect(weights.has(weight)).toBe(true);
  });

  it('iOS links the same files, and every file exists', () => {
    const ios = fontPlugin().ios?.fonts ?? [];
    const android = fontPlugin().android?.fonts?.flatMap((f) => f.fontDefinitions) ?? [];
    expect(new Set(ios)).toEqual(new Set(android.map((d) => d.path)));
    for (const path of ios) expect(existsSync(join(import.meta.dir, '../..', path))).toBe(true);
  });
});
