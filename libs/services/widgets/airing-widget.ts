// Pushes the "next episodes" timeline to the home-screen widget (iOS).
// The widget cannot read app data, so every state is decided here: Pro and
// watching something → the list; nothing airing → a short line; not Pro → locked.
import { Platform } from 'react-native';
import { getAppLanguageSync } from '../../i18n/app-language';
import { translate } from '../../i18n/engine';
import { resolveDisplayTitleSync } from '../../i18n/use-display-title';
import { loadWatchingSchedule } from '../notifications/auto-episode-reminders';
import { buildAiringTimeline } from './airing-timeline';
import type { AiringWidgetProps } from '../../../widgets/AiringWidget';

const WIDGET_URL = 'aniseeker:///bangumi';

let running = false;

/** Never throws: a widget that failed to update keeps its last timeline. */
export async function refreshAiringWidget(isPro: boolean): Promise<void> {
  if (Platform.OS !== 'ios' || running) return;
  running = true;
  try {
    // Loaded lazily: the SwiftUI components only exist on iOS.
    const { default: AiringWidget } = await import('../../../widgets/AiringWidget');
    const lang = getAppLanguageSync();
    const t = (key: string, values?: Record<string, string | number>) =>
      translate(lang, key, values);
    const base = { heading: t('bangumiTab.widget.heading'), url: WIDGET_URL };
    const messageOnly = (
      state: AiringWidgetProps['state'],
      message: string
    ): AiringWidgetProps => ({
      ...base,
      state,
      message,
      items: [],
    });

    if (!isPro) {
      AiringWidget.updateSnapshot(messageOnly('locked', t('bangumiTab.widget.locked')));
      return;
    }

    const whenFormat = new Intl.DateTimeFormat(lang, {
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    // Same title language the schedule tab shows.
    const entries = buildAiringTimeline(
      await loadWatchingSchedule(),
      Date.now(),
      (ms) => whenFormat.format(new Date(ms)),
      (anime) => resolveDisplayTitleSync(anime, lang)
    );
    AiringWidget.updateTimeline(
      entries.map((entry, index) => ({
        date: entry.date,
        props:
          entry.items.length > 0
            ? {
                ...base,
                state: 'ready' as const,
                message: '',
                items: entry.items.map((item) => ({
                  title: item.title,
                  detail: t('bangumiTab.widget.itemDetail', {
                    episode: item.episode,
                    when: item.when,
                  }),
                })),
              }
            : // The first entry being empty means nothing is airing; a later one
              // means everything we knew about has aired since the last refresh.
              messageOnly(
                index === 0 ? 'empty' : 'stale',
                t(index === 0 ? 'bangumiTab.widget.empty' : 'bangumiTab.widget.stale')
              ),
      }))
    );
  } catch (error) {
    console.warn('[airing-widget] refresh failed', error);
  } finally {
    running = false;
  }
}
