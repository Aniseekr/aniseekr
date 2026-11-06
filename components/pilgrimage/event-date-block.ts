import type { TranslationKey, TranslationValues } from '../../libs/i18n';
import type { EventDateState } from '../../libs/services/pilgrimage/local-intel/event-schedule';
import type { LocalityEvent } from '../../libs/services/pilgrimage/locality/types';
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

type Translate = (key: TranslationKey, values?: TranslationValues) => string;

/** Human schedule line for an event: permanent/since, a real date or range, or TBA. */
export function formatEventSchedule(
  event: LocalityEvent,
  state: EventDateState,
  language: string,
  t: Translate
): string {
  if (event.schedule.kind === 'ongoing') {
    return event.schedule.since
      ? t('pilgrimageUi.eventDetail.since', { date: event.schedule.since })
      : t('pilgrimageUi.eventDetail.permanent');
  }
  const occurrence =
    state.state === 'active' || state.state === 'upcoming' || state.state === 'ended'
      ? state.occurrence
      : null;
  if (occurrence) {
    return occurrence.startsAt === occurrence.endsAt
      ? occurrence.startsAt
      : t('pilgrimageUi.eventDetail.dateRange', {
          start: occurrence.startsAt,
          end: occurrence.endsAt,
        });
  }
  if (state.state === 'unannounced') {
    return t('pilgrimageUi.intel.tbaAnnual', {
      month: formatMonthLabel(state.typicalMonth, language),
    });
  }
  return t('pilgrimageUi.eventDetail.dateTba');
}
