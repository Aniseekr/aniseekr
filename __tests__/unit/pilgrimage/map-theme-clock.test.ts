import { describe, expect, it } from 'bun:test';

import {
  isMapNightHour,
  resolveMapModeWithClock,
} from '../../../libs/services/pilgrimage/map-theme-clock';

describe('isMapNightHour', () => {
  it('is night from 18:00 through 05:59', () => {
    expect(isMapNightHour(18)).toBe(true);
    expect(isMapNightHour(23)).toBe(true);
    expect(isMapNightHour(0)).toBe(true);
    expect(isMapNightHour(5)).toBe(true);
  });

  it('is day from 06:00 through 17:59', () => {
    expect(isMapNightHour(6)).toBe(false);
    expect(isMapNightHour(12)).toBe(false);
    expect(isMapNightHour(17)).toBe(false);
  });
});

describe('resolveMapModeWithClock', () => {
  it('honors an explicit light pick regardless of clock', () => {
    expect(resolveMapModeWithClock('light', 'dark', 23)).toBe('light');
    expect(resolveMapModeWithClock('light', 'light', 3)).toBe('light');
  });

  it('honors an explicit dark pick regardless of clock', () => {
    expect(resolveMapModeWithClock('dark', 'light', 12)).toBe('dark');
  });

  it('auto goes dark at night even when the app is light', () => {
    expect(resolveMapModeWithClock('auto', 'light', 20)).toBe('dark');
    expect(resolveMapModeWithClock('auto', 'light', 2)).toBe('dark');
  });

  it('auto stays light during the day when the app is light', () => {
    expect(resolveMapModeWithClock('auto', 'light', 10)).toBe('light');
  });

  it('auto follows a dark app theme during the day', () => {
    expect(resolveMapModeWithClock('auto', 'dark', 10)).toBe('dark');
  });
});
