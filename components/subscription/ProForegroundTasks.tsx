// Work tied to the app coming to the foreground (and leaving it). Renders nothing.
// Auto-sync and auto reminders are Pro; the widget is refreshed for everyone so
// it can show its locked state, and again on the way out so the home screen
// reflects what was just changed in the app.
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useSubscription } from '../../context/SubscriptionContext';
import { maybeAutoSync } from '../../libs/services/sync/auto-sync';
import { refreshAutoEpisodeReminders } from '../../libs/services/notifications/auto-episode-reminders';
import { refreshAiringWidget } from '../../libs/services/widgets/airing-widget';

export function ProForegroundTasks() {
  const { isPro } = useSubscription();

  useEffect(() => {
    const onForeground = () => {
      void refreshAiringWidget(isPro);
      if (!isPro) return;
      void maybeAutoSync(true);
      void refreshAutoEpisodeReminders(true);
    };
    onForeground();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') onForeground();
      else if (state === 'background') void refreshAiringWidget(isPro);
    });
    return () => sub.remove();
  }, [isPro]);

  return null;
}
