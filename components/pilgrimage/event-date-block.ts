import type { EventDateState } from '../../libs/services/pilgrimage/local-intel/event-schedule';
import { formatMonthLabel } from './detail/intel-format';

export interface EventDateBlock {
  top: string;
  main: string;
  emphasis: 'active' | 'upcoming' | 'ongoing' | 'tba';
}

export function deriveEventDateBlock(state: EventDateState, language: string): EventDateBlock {
  if (state.state === 'active' && state.occurrence === null) {
    return {
      top: isCjk(language) ? '常設' : 'Always',
      main: '',
      emphasis: 'ongoing',
    };
  }
  if ((state.state === 'active' || state.state === 'upcoming') && state.occurrence) {
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
      top: isCjk(language) ? '未定' : 'TBA',
      main: formatMonthLabel(state.typicalMonth, language),
      emphasis: 'tba',
    };
  }
  return {
    top: isCjk(language) ? '未定' : 'TBA',
    main: '',
    emphasis: 'tba',
  };
}

function isCjk(language: string): boolean {
  const lang = language.toLowerCase();
  return lang.startsWith('zh') || lang.startsWith('ja');
}
