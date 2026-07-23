/* eslint-disable react-hooks/set-state-in-effect -- Existing open-load effect; Phase 3 only replaces the sheet shell. */
import { memo, useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Notifications from 'expo-notifications';
import { Spacing, Typography } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import { EmptyStateView } from '../common/EmptyStateView';
import { ThemedBottomSheet } from '../themed';
import { notificationService } from '../../libs/services/notifications/notification-service';
import { animeNotificationService } from '../../modules/notifications/animeNotificationService';
import { useT } from '../../libs/i18n';

interface PendingNotification {
  identifier: string;
  title: string;
  body: string;
  scheduledFor?: Date;
}

interface NotificationManagerSheetProps {
  visible: boolean;
  onClose: () => void;
}

const TEST_REMINDER_DELAY_SECONDS = 5;

function NotificationManagerSheetComponent({ visible, onClose }: NotificationManagerSheetProps) {
  const { theme } = useTheme();
  const t = useT();
  const [pending, setPending] = useState<PendingNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);

  const fetchPending = useCallback(async () => {
    setLoading(true);
    try {
      const items = await Notifications.getAllScheduledNotificationsAsync();
      const mapped: PendingNotification[] = items.map((n) => {
        let scheduledFor: Date | undefined;
        const trigger = n.trigger as any;
        if (trigger?.date) {
          scheduledFor = new Date(trigger.date);
        } else if (trigger?.seconds) {
          scheduledFor = new Date(Date.now() + trigger.seconds * 1000);
        }
        return {
          identifier: n.identifier,
          title: n.content.title ?? 'Reminder',
          body: n.content.body ?? '',
          scheduledFor,
        };
      });
      setPending(mapped);
    } catch (e) {
      console.warn('[NotificationManager] failed:', e);
      setPending([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) fetchPending();
  }, [visible, fetchPending]);

  const handleDelete = async (id: string) => {
    hapticsBridge.warning();
    try {
      await Notifications.cancelScheduledNotificationAsync(id);
      setPending((prev) => prev.filter((p) => p.identifier !== id));
      // Keep facade mirror in sync so the bell icon on cards reflects OS state.
      await animeNotificationService.rehydrate();
    } catch (e) {
      console.warn('[NotificationManager] cancel failed:', e);
      hapticsBridge.error();
    }
  };

  const handleSendTest = useCallback(async () => {
    if (testing) return;
    setTesting(true);
    hapticsBridge.tap();
    try {
      await notificationService.initialize();
      const perm = await notificationService.getPermission();
      if (!perm.granted) {
        const requested = await notificationService.requestPermission();
        if (!requested.granted) {
          hapticsBridge.warning();
          console.warn('[NotificationManager] permission denied for test reminder');
          return;
        }
      }
      await Notifications.scheduleNotificationAsync({
        content: {
          title: t('bangumiTab.testReminder'),
          body: `Fires ${TEST_REMINDER_DELAY_SECONDS}s after you tap — leave the app to see the banner.`,
          data: { kind: 'test_reminder' },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: TEST_REMINDER_DELAY_SECONDS,
          repeats: false,
          channelId: Platform.OS === 'android' ? 'default' : undefined,
        },
      });
      hapticsBridge.success();
      // Refresh pending list so user sees it queued before it fires.
      await fetchPending();
    } catch (e) {
      console.warn('[NotificationManager] test reminder failed:', e);
      hapticsBridge.error();
    } finally {
      setTesting(false);
    }
  }, [testing, fetchPending, t]);

  const handleClearAll = async () => {
    hapticsBridge.warning();
    try {
      await animeNotificationService.cancelAllNotifications();
      setPending([]);
      hapticsBridge.success();
    } catch (e) {
      console.warn('[NotificationManager] cancel-all failed:', e);
      hapticsBridge.error();
    }
  };

  return (
    <ThemedBottomSheet visible={visible} onClose={onClose}>
      <SafeAreaView edges={['bottom']}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: theme.text.primary }]}>
              {t('bangumiTab.reminders')}
            </Text>
            <Text style={[styles.subtitle, { color: theme.text.secondary }]}>
              {pending.length} pending notification{pending.length === 1 ? '' : 's'}
            </Text>
          </View>
          <Pressable onPress={onClose} hitSlop={12}>
            <MaterialIcons name="close" size={22} color={theme.text.secondary} />
          </Pressable>
        </View>

        <Pressable
          onPress={handleSendTest}
          disabled={testing}
          style={({ pressed }) => [
            styles.testButton,
            {
              backgroundColor: theme.accent + '1A',
              borderColor: theme.accent + '55',
              opacity: testing ? 0.6 : pressed ? 0.7 : 1,
            },
          ]}>
          {testing ? (
            <ActivityIndicator size="small" color={theme.accent} />
          ) : (
            <MaterialIcons name="notifications-active" size={18} color={theme.accent} />
          )}
          <Text style={[styles.testLabel, { color: theme.accent }]}>
            {testing
              ? t('bangumiTab.scheduling')
              : `Send test reminder (${TEST_REMINDER_DELAY_SECONDS}s)`}
          </Text>
        </Pressable>

        {loading ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator color={theme.accent} />
          </View>
        ) : pending.length === 0 ? (
          <EmptyStateView
            icon="notifications-none"
            title={t('bangumiTab.noPendingReminders')}
            description={t('bangumiTab.tapTheBellOnAn')}
          />
        ) : (
          <>
            <ScrollView style={{ maxHeight: 400 }}>
              {pending.map((n) => (
                <View
                  key={n.identifier}
                  style={[
                    styles.row,
                    {
                      backgroundColor: theme.background.tertiary,
                      borderColor: theme.glassBorder,
                    },
                  ]}>
                  <View style={[styles.icon, { backgroundColor: theme.accent + '24' }]}>
                    <MaterialIcons name="notifications-active" size={20} color={theme.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[styles.rowTitle, { color: theme.text.primary }]}
                      numberOfLines={1}>
                      {n.title}
                    </Text>
                    <Text
                      style={[styles.rowBody, { color: theme.text.secondary }]}
                      numberOfLines={2}>
                      {n.body}
                    </Text>
                    {n.scheduledFor ? (
                      <Text style={[styles.scheduled, { color: theme.text.tertiary }]}>
                        {n.scheduledFor.toLocaleString()}
                      </Text>
                    ) : null}
                  </View>
                  <Pressable
                    onPress={() => handleDelete(n.identifier)}
                    hitSlop={8}
                    style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
                    <MaterialIcons name="delete-outline" size={22} color={theme.text.secondary} />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
            <Pressable
              onPress={handleClearAll}
              style={({ pressed }) => [
                styles.clearAllButton,
                {
                  backgroundColor: theme.status.error + '12',
                  borderColor: theme.status.error + '33',
                  opacity: pressed ? 0.7 : 1,
                },
              ]}>
              <MaterialIcons name="delete-sweep" size={18} color={theme.status.error} />
              <Text style={[styles.clearAllLabel, { color: theme.status.error }]}>
                {t('bangumiTab.clearAll')}
              </Text>
            </Pressable>
          </>
        )}
      </SafeAreaView>
    </ThemedBottomSheet>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  title: {
    ...Typography.headlineSmall,
  },
  subtitle: {
    ...Typography.bodySmall,
    marginTop: 2,
  },
  loaderWrap: {
    paddingVertical: Spacing.xl,
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.sm,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: Spacing.xs,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: {
    ...Typography.titleMedium,
  },
  rowBody: {
    ...Typography.bodySmall,
    marginTop: 2,
  },
  scheduled: {
    ...Typography.captionSmall,
    marginTop: 4,
  },
  clearAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: Spacing.sm + 2,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: Spacing.sm,
  },
  testButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: Spacing.sm + 2,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: Spacing.sm,
  },
  testLabel: {
    ...Typography.titleSmall,
    fontWeight: '700',
  },
  clearAllLabel: {
    ...Typography.titleSmall,
    fontWeight: '700',
  },
});

export const NotificationManagerSheet = memo(NotificationManagerSheetComponent);
