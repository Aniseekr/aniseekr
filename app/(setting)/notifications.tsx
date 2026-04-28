import { useEffect, useState } from 'react';
import { Alert, Linking, Platform, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Spacing, Typography } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import {
  SettingsScreenLayout,
  SettingsRow,
  SettingsSection,
} from '../../components/setting/SettingsScreenLayout';

interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}
let AsyncStorage: AsyncStorageLike;
try {
  AsyncStorage = require('@react-native-async-storage/async-storage').default;
} catch {
  const memory = new Map<string, string>();
  AsyncStorage = {
    async getItem(k) {
      return memory.get(k) ?? null;
    },
    async setItem(k, v) {
      memory.set(k, v);
    },
  };
}

const PREFS_KEY = '@aniseekr/notifications/prefs';

interface NotifPrefs {
  episodeReminders: boolean;
  weeklyDigest: boolean;
  movieDrops: boolean;
  leadTimeMinutes: number;
}

const DEFAULTS: NotifPrefs = {
  episodeReminders: true,
  weeklyDigest: false,
  movieDrops: true,
  leadTimeMinutes: 15,
};

const LEAD_OPTIONS = [5, 15, 30, 60];

export default function NotificationsScreen() {
  const { theme } = useTheme();
  const [prefs, setPrefs] = useState<NotifPrefs>(DEFAULTS);
  const [permission, setPermission] = useState<'granted' | 'denied' | 'undetermined'>('undetermined');
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    AsyncStorage.getItem(PREFS_KEY).then((raw) => {
      if (raw) {
        try {
          setPrefs({ ...DEFAULTS, ...JSON.parse(raw) });
        } catch {}
      }
    });
    refreshStatus();
  }, []);

  const refreshStatus = async () => {
    try {
      const status = await Notifications.getPermissionsAsync();
      setPermission(status.granted ? 'granted' : status.canAskAgain ? 'undetermined' : 'denied');
      const pending = await Notifications.getAllScheduledNotificationsAsync();
      setPendingCount(pending.length);
    } catch {
      setPermission('undetermined');
    }
  };

  const update = async (next: NotifPrefs) => {
    hapticsBridge.selection();
    setPrefs(next);
    try {
      await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(next));
    } catch {}
  };

  const requestPermission = async () => {
    const result = await Notifications.requestPermissionsAsync();
    if (result.granted) {
      hapticsBridge.success();
      setPermission('granted');
    } else {
      hapticsBridge.error();
      setPermission('denied');
      Alert.alert(
        'Permission required',
        'Open system settings to enable notifications for Aniseekr.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Open settings',
            onPress: () => Linking.openSettings(),
          },
        ]
      );
    }
  };

  const cancelAll = async () => {
    Alert.alert(
      'Cancel all reminders?',
      'You can re-enable individual reminders by tapping the bell on an episode.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Cancel all',
          style: 'destructive',
          onPress: async () => {
            await Notifications.cancelAllScheduledNotificationsAsync();
            hapticsBridge.warning();
            await refreshStatus();
          },
        },
      ]
    );
  };

  return (
    <SettingsScreenLayout
      title="Notifications"
      subtitle={`${pendingCount} scheduled · ${permission}`}>
      {permission !== 'granted' ? (
        <View
          style={[
            styles.banner,
            {
              backgroundColor: theme.accent + '12',
              borderColor: theme.accent + '40',
            },
          ]}>
          <MaterialIcons name="notifications-off" size={22} color={theme.accent} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.bannerTitle, { color: theme.text.primary }]}>
              Notifications are off
            </Text>
            <Text style={[styles.bannerBody, { color: theme.text.secondary }]}>
              Allow notifications so we can remind you when episodes drop.
            </Text>
          </View>
          <Pressable
            onPress={requestPermission}
            style={({ pressed }) => [
              styles.bannerAction,
              { backgroundColor: theme.accent, opacity: pressed ? 0.85 : 1 },
            ]}>
            <Text style={styles.bannerActionLabel}>Allow</Text>
          </Pressable>
        </View>
      ) : null}

      <SettingsSection title="What to send">
        <ToggleSwitchRow
          label="Episode reminders"
          description="Notify me before each new episode"
          value={prefs.episodeReminders}
          onChange={(v) => update({ ...prefs, episodeReminders: v })}
          icon="notifications-active"
        />
        <Divider />
        <ToggleSwitchRow
          label="Weekly digest"
          description="Sunday recap of upcoming episodes"
          value={prefs.weeklyDigest}
          onChange={(v) => update({ ...prefs, weeklyDigest: v })}
          icon="event-note"
        />
        <Divider />
        <ToggleSwitchRow
          label="Movie & special drops"
          description="Alerts for new theatrical releases"
          value={prefs.movieDrops}
          onChange={(v) => update({ ...prefs, movieDrops: v })}
          icon="movie-creation"
        />
      </SettingsSection>

      <SettingsSection title="Reminder lead time">
        {LEAD_OPTIONS.map((mins, idx) => (
          <View key={mins}>
            <Pressable
              onPress={() => update({ ...prefs, leadTimeMinutes: mins })}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: Spacing.sm + 2,
                paddingVertical: Spacing.sm + 2,
                opacity: pressed ? 0.7 : 1,
              })}>
              <View
                style={[
                  styles.radio,
                  {
                    borderColor:
                      prefs.leadTimeMinutes === mins ? theme.accent : theme.glassBorder,
                  },
                ]}>
                {prefs.leadTimeMinutes === mins ? (
                  <View style={[styles.radioInner, { backgroundColor: theme.accent }]} />
                ) : null}
              </View>
              <Text style={[styles.leadLabel, { color: theme.text.primary }]}>
                {mins} minutes before
              </Text>
            </Pressable>
            {idx < LEAD_OPTIONS.length - 1 ? <Divider /> : null}
          </View>
        ))}
      </SettingsSection>

      <SettingsSection title="Manage">
        <SettingsRow
          icon="settings"
          label="Open system settings"
          onPress={() => Linking.openSettings()}
        />
        <Divider />
        <SettingsRow
          icon="delete-sweep"
          label="Cancel all reminders"
          destructive
          onPress={cancelAll}
        />
      </SettingsSection>

      {Platform.OS === 'android' ? (
        <Text style={[styles.footnote, { color: theme.text.tertiary }]}>
          Android schedules reminders via the local AlarmManager. They run even
          if the app is closed, but battery optimisations may delay them by a
          few minutes on some devices.
        </Text>
      ) : null}
    </SettingsScreenLayout>
  );
}

function Divider() {
  const { theme } = useTheme();
  return <View style={{ height: 1, marginLeft: 56, backgroundColor: theme.glassBorder }} />;
}

function ToggleSwitchRow({
  icon,
  label,
  description,
  value,
  onChange,
}: {
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  label: string;
  description?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const { theme } = useTheme();
  return (
    <View style={styles.toggleRow}>
      <View
        style={[
          styles.toggleIcon,
          { backgroundColor: theme.background.tertiary },
        ]}>
        <MaterialIcons name={icon} size={18} color={theme.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.toggleLabel, { color: theme.text.primary }]}>{label}</Text>
        {description ? (
          <Text style={[styles.toggleDescription, { color: theme.text.secondary }]}>
            {description}
          </Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={(v) => {
          hapticsBridge.selection();
          onChange(v);
        }}
        trackColor={{ false: theme.background.primary, true: theme.accent }}
        thumbColor={value ? '#fff' : '#ddd'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: 16,
    borderWidth: 1,
  },
  bannerTitle: {
    ...Typography.titleMedium,
  },
  bannerBody: {
    ...Typography.bodySmall,
    marginTop: 2,
  },
  bannerAction: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: 18,
  },
  bannerActionLabel: {
    ...Typography.titleSmall,
    color: '#0E0A06',
    fontWeight: '700',
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.sm,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  leadLabel: {
    ...Typography.titleMedium,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.sm + 2,
  },
  toggleIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleLabel: {
    ...Typography.titleMedium,
  },
  toggleDescription: {
    ...Typography.bodySmall,
    marginTop: 2,
  },
  footnote: {
    ...Typography.captionSmall,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
  },
});
