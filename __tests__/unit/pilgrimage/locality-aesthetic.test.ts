import { describe, expect, it } from 'bun:test';

import {
  localityEventAccent,
  localityMarkerPalette,
} from '../../../components/pilgrimage/common/locality-aesthetic';
import type { ThemePalette } from '../../../context/ThemeContext';

const theme = {
  accent: 'winter-accent',
  secondary: 'spring-accent',
  status: {
    success: 'success-accent',
    warning: 'autumn-accent',
    error: 'error-accent',
    info: 'summer-accent',
  },
} as ThemePalette;

describe('locality aesthetic palette', () => {
  it('PILG-UI-001 derives seasonal accents from real occurrence months', () => {
    expect(
      localityEventAccent(
        {
          state: 'upcoming',
          startsInDays: 1,
          occurrence: { year: 2026, startsAt: '2026-04-01', endsAt: '2026-04-10' },
        },
        'other',
        theme
      )
    ).toBe('spring-accent');
    expect(localityEventAccent({ state: 'unannounced', typicalMonth: 7 }, 'other', theme)).toBe(
      'summer-accent'
    );
    expect(
      localityEventAccent(
        {
          state: 'active',
          occurrence: { year: 2026, startsAt: '2026-10-01', endsAt: '2026-10-10' },
        },
        'other',
        theme
      )
    ).toBe('autumn-accent');
    expect(
      localityEventAccent(
        {
          state: 'ended',
          occurrence: { year: 2026, startsAt: '2026-01-01', endsAt: '2026-01-10' },
        },
        'other',
        theme
      )
    ).toBe('winter-accent');
  });

  it('PILG-UI-002 keeps ongoing events and map roles type-distinct', () => {
    expect(localityEventAccent({ state: 'active', occurrence: null }, 'collab_cafe', theme)).toBe(
      'spring-accent'
    );
    expect(localityEventAccent({ state: 'active', occurrence: null }, 'festival', theme)).toBe(
      'autumn-accent'
    );
    expect(localityMarkerPalette(theme)).toEqual({
      stamp: 'winter-accent',
      shop: 'spring-accent',
      festival: 'autumn-accent',
      area: 'summer-accent',
    });
  });
});
