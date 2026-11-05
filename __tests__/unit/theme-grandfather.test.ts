import { describe, expect, it } from 'bun:test';
import { THEMES, isThemeUnlocked, resolveGrandfatheredTheme } from '../../context/ThemeContext';

// Entitlement seam: before 1.3.0 everyone counted as Pro, so a saved premium
// theme must survive the paywall coming back — and only that one theme.
describe('theme grandfathering', () => {
  it('records a saved premium theme on the first run', () => {
    expect(resolveGrandfatheredTheme('cyberpunk', null)).toBe('cyberpunk');
    expect(resolveGrandfatheredTheme('attackOnTitan', null)).toBe('attackOnTitan');
  });

  it('records nothing for a free, missing or unknown saved theme', () => {
    expect(resolveGrandfatheredTheme('midnight', null)).toBe('');
    expect(resolveGrandfatheredTheme(null, null)).toBe('');
    expect(resolveGrandfatheredTheme('gone', null)).toBe('');
  });

  it('never rewrites an existing record (no grandfathering a later premium pick)', () => {
    expect(resolveGrandfatheredTheme('washi', '')).toBe('');
    expect(resolveGrandfatheredTheme('washi', 'cyberpunk')).toBe('cyberpunk');
  });

  it('a non-Pro user keeps the grandfathered theme but not other premium ones', () => {
    const opts = {
      isPro: false,
      activeThemeId: 'midnight' as const,
      grandfatheredThemeId: 'cyberpunk',
    };
    expect(isThemeUnlocked(THEMES.cyberpunk, opts)).toBe(true);
    expect(isThemeUnlocked(THEMES.washi, opts)).toBe(false);
    expect(isThemeUnlocked(THEMES.attackOnTitan, opts)).toBe(false);
    expect(isThemeUnlocked(THEMES.midnight, opts)).toBe(true);
  });

  it('Pro unlocks every theme', () => {
    const opts = { isPro: true, activeThemeId: 'aniseeker' as const, grandfatheredThemeId: '' };
    expect(Object.values(THEMES).every((p) => isThemeUnlocked(p, opts))).toBe(true);
  });
});
