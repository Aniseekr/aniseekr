import type { ThemePalette } from '../../../context/ThemeContext';
import type { EventDateState } from '../../../libs/services/pilgrimage/local-intel/event-schedule';
import type { EventCategory } from '../../../libs/services/pilgrimage/locality/types';

export interface LocalityMarkerPalette {
  stamp: string;
  shop: string;
  festival: string;
  area: string;
}

export function localityMarkerPalette(theme: ThemePalette): LocalityMarkerPalette {
  return {
    stamp: theme.accent,
    shop: theme.secondary,
    festival: theme.status.warning,
    area: theme.status.info,
  };
}

/**
 * Seasonal color is derived only from a sourced occurrence/typical month.
 * Permanent events have no honest season, so they retain their category color.
 */
export function localityEventAccent(
  state: EventDateState,
  category: EventCategory,
  theme: ThemePalette
): string {
  const month = eventMonth(state);
  if (month !== null) {
    if (month >= 3 && month <= 5) return theme.secondary;
    if (month >= 6 && month <= 8) return theme.status.info;
    if (month >= 9 && month <= 11) return theme.status.warning;
    return theme.accent;
  }

  if (category === 'festival') return theme.status.warning;
  if (category === 'collab_cafe') return theme.secondary;
  if (category === 'exhibition') return theme.status.info;
  return theme.accent;
}

function eventMonth(state: EventDateState): number | null {
  if (state.state === 'unannounced') return validMonth(state.typicalMonth);
  if (!state.occurrence) return null;
  return validMonth(Number(state.occurrence.startsAt.slice(5, 7)));
}

function validMonth(month: number): number | null {
  return Number.isInteger(month) && month >= 1 && month <= 12 ? month : null;
}
