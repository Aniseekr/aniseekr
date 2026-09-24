import { describe, expect, it } from 'bun:test';
import { THEMES, type ThemePalette } from '../../context/ThemeContext';
import { themedSwitchColors } from '../../components/themed/ThemedSwitch';
import { ON_DARK } from '../../components/themed/contrast';

const dark = THEMES.aniseeker as ThemePalette;
// Light surfaces carry a near-black text colour — the thumb must not follow it.
const light: ThemePalette = {
  ...dark,
  text: { ...dark.text, primary: '#0E0E12' },
  background: { primary: '#FFFFFF', secondary: '#F2F2F7', tertiary: '#E5E5EA' },
};

describe('themedSwitchColors', () => {
  it('uses the accent for the on track and the tertiary surface when off', () => {
    const colors = themedSwitchColors(dark);
    expect(colors.trackColor.true).toBe(dark.accent);
    expect(colors.trackColor.false).toBe(dark.background.tertiary);
    expect(colors.iosBackground).toBe(dark.background.tertiary);
  });

  it('honours a per-switch accent override (e.g. the R18 toggle)', () => {
    expect(themedSwitchColors(dark, '#FF453A').trackColor.true).toBe('#FF453A');
  });

  it('keeps the native white thumb in light and dark modes', () => {
    expect(themedSwitchColors(dark).thumbColor).toBe(ON_DARK);
    expect(themedSwitchColors(light).thumbColor).toBe(ON_DARK);
  });
});
