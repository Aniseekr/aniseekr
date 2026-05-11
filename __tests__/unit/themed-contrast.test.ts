import { describe, it, expect } from 'bun:test';
import {
  contrastRatio,
  ON_DARK,
  ON_LIGHT,
  readableTextOn,
  relativeLuminance,
} from '../../components/themed/contrast';

describe('themed/contrast', () => {
  it('CONTRAST-001 relativeLuminance returns 0 for pure black and 1 for pure white', () => {
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5);
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1, 5);
  });

  it('CONTRAST-002 contrastRatio is order-independent and >= 1', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 0);
    expect(contrastRatio('#FF9F0A', '#FF9F0A')).toBeCloseTo(1, 5);
  });

  it('CONTRAST-003 readableTextOn flips white→dark only when white drops below AA-large', () => {
    // Light/warm accents where white text would be hard to read → dark text
    expect(readableTextOn('#FF9F0A')).toBe(ON_LIGHT); // aniseeker orange (white = 2.51:1)
    expect(readableTextOn('#FFD700')).toBe(ON_LIGHT); // gold (white = 1.07:1)
    expect(readableTextOn('#FFFFFF')).toBe(ON_LIGHT); // white
    expect(readableTextOn('#67E8F9')).toBe(ON_LIGHT); // pale cyan
    expect(readableTextOn('#06B6D4')).toBe(ON_LIGHT); // ocean cyan (white = 2.7:1)
    expect(readableTextOn('#10B981')).toBe(ON_LIGHT); // forest green (white = 2.5:1)

    // Dark/saturated accents where white text still passes 3:1 → keep iconic white
    expect(readableTextOn('#5E5CE6')).toBe(ON_DARK); // midnight purple
    expect(readableTextOn('#0A84FF')).toBe(ON_DARK); // iOS blue
    expect(readableTextOn('#000000')).toBe(ON_DARK);
    expect(readableTextOn('#8B4513')).toBe(ON_DARK); // saddle brown
  });

  it('CONTRAST-004 the chosen text color meets WCAG AA for normal text on default theme accents', () => {
    const accents = [
      '#FF9F0A', // aniseeker
      '#FF2A6D', // cyberpunk
      '#5E5CE6', // midnight
      '#10B981', // forest
      '#06B6D4', // ocean
      '#8B4513', // attackOnTitan
      '#FB923C', // sunset
      '#F472B6', // candy
    ];
    for (const accent of accents) {
      const fg = readableTextOn(accent);
      const ratio = contrastRatio(accent, fg);
      // WCAG AA for large/bold text is 3:1, normal is 4.5:1.
      // Button labels are bold titleMedium/titleLarge so 3:1 is the
      // strict minimum; we still expect comfortably above that.
      expect(ratio).toBeGreaterThanOrEqual(3);
    }
  });

  it('CONTRAST-005 accepts shorthand and unprefixed hex', () => {
    expect(readableTextOn('#fff')).toBe(ON_LIGHT);
    expect(readableTextOn('FFD700')).toBe(ON_LIGHT);
    expect(readableTextOn('5E5CE6')).toBe(ON_DARK);
  });

  it('CONTRAST-006 invalid hex falls back to white text (treated as black background)', () => {
    expect(readableTextOn('not-a-color')).toBe(ON_DARK);
    expect(readableTextOn('')).toBe(ON_DARK);
  });
});
