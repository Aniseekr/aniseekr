import type { EventDateState } from '../../libs/services/pilgrimage/local-intel/event-schedule';
import { formatMonthLabel } from './detail/intel-format';

export interface EventDateBlock {
  top: string;
  main: string;
  emphasis: 'active' | 'upcoming' | 'ongoing' | 'ended' | 'tba';
}

export interface EventDateBlockLabels {
  ongoing: string;
  tba: string;
}

export function deriveEventDateBlock(
  state: EventDateState,
  language: string,
  labels: EventDateBlockLabels
): EventDateBlock {
  if (state.state === 'active' && state.occurrence === null) {
    return {
      top: labels.ongoing,
      main: '',
      emphasis: 'ongoing',
    };
  }
  if (
    (state.state === 'active' || state.state === 'upcoming' || state.state === 'ended') &&
    state.occurrence
  ) {
    const month = Number(state.occurrence.startsAt.slice(5, 7));
    const day = Number(state.occurrence.startsAt.slice(8, 10));
    return {
      top: formatMonthLabel(month, language),
      main: Number.isFinite(day) ? String(day) : '',
      emphasis: state.state,
    };
  }
  if (state.state === 'unannounced') {
    return {
      top: labels.tba,
      main: formatMonthLabel(state.typicalMonth, language),
      emphasis: 'tba',
    };
  }
  return {
    top: labels.tba,
    main: '',
    emphasis: 'tba',
  };
}
