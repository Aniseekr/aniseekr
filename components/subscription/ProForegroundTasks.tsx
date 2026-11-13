// Pro work tied to the app coming to the foreground: auto-sync and auto
// episode reminders. Renders nothing.
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useSubscription } from '../../context/SubscriptionContext';
import { maybeAutoSync } from '../../libs/services/sync/auto-sync';
import { refreshAutoEpisodeReminders } from '../../libs/services/notifications/auto-episode-reminders';

export function ProForegroundTasks() {
  const { isPro } = useSubscription();

  useEffect(() => {
    if (!isPro) return;
    const onForeground = () => {
      void maybeAutoSync(true);
      void refreshAutoEpisodeReminders(true);
    };
    onForeground();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') onForeground();
    });
    return () => sub.remove();
  }, [isPro]);

  return null;
}
