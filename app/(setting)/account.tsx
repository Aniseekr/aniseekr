import { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Spacing, Typography } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import {
  SettingsScreenLayout,
  SettingsRow,
  SettingsSection,
} from '../../components/setting/SettingsScreenLayout';
import { authService } from '../../libs/services/auth/auth-service';
import type { PlatformType } from '../../libs/services/auth/types';

interface PlatformDef {
  id: PlatformType;
  name: string;
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  color: string;
}

const PLATFORMS: PlatformDef[] = [
  { id: 'anilist', name: 'AniList', icon: 'public', color: '#02A9FF' },
  { id: 'myanimelist', name: 'MyAnimeList', icon: 'data-usage', color: '#2E51A2' },
  { id: 'bangumi', name: 'Bangumi 番组计划', icon: 'translate', color: '#F09199' },
  { id: 'kitsu', name: 'Kitsu', icon: 'collections', color: '#F75239' },
  { id: 'annict', name: 'Annict', icon: 'language', color: '#F65B5B' },
  { id: 'shikimori', name: 'Shikimori', icon: 'public', color: '#1E90FF' },
  { id: 'simkl', name: 'SIMKL', icon: 'movie', color: '#1B1B1B' },
];

type ConnectionState = Record<PlatformType, boolean>;

export default function AccountScreen() {
  const { theme } = useTheme();
  const [connections, setConnections] = useState<ConnectionState>({} as ConnectionState);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    refreshAll();
  }, []);

  const refreshAll = async () => {
    const next: Partial<ConnectionState> = {};
    for (const p of PLATFORMS) {
      try {
        const token = await tryGetToken(p.id);
        next[p.id] = !!token;
      } catch {
        next[p.id] = false;
      }
    }
    setConnections(next as ConnectionState);
  };

  const tryGetToken = async (platform: PlatformType): Promise<string | null> => {
    const svc = authService as any;
    if (typeof svc.getToken === 'function') {
      return await svc.getToken(platform);
    }
    if (typeof svc.isAuthenticated === 'function') {
      const ok = await svc.isAuthenticated(platform);
      return ok ? 'connected' : null;
    }
    return null;
  };

  const handleConnect = async (platform: PlatformDef) => {
    setLoading(true);
    try {
      const svc = authService as any;
      if (typeof svc.signIn === 'function') {
        await svc.signIn(platform.id);
        hapticsBridge.success();
      } else if (typeof svc.authenticate === 'function') {
        await svc.authenticate(platform.id);
        hapticsBridge.success();
      } else {
        Alert.alert(
          'Sign-in unavailable',
          `${platform.name} OAuth is not implemented yet in this build.`
        );
      }
    } catch (e) {
      hapticsBridge.error();
      Alert.alert(
        `Couldn't connect to ${platform.name}`,
        e instanceof Error ? e.message : 'Unknown error'
      );
    } finally {
      await refreshAll();
      setLoading(false);
    }
  };

  const handleDisconnect = (platform: PlatformDef) => {
    Alert.alert(
      `Disconnect ${platform.name}?`,
      'Your local data stays. You can reconnect any time.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            try {
              const svc = authService as any;
              if (typeof svc.signOut === 'function') {
                await svc.signOut(platform.id);
              } else if (typeof svc.logout === 'function') {
                await svc.logout(platform.id);
              }
              hapticsBridge.warning();
            } catch (e) {
              hapticsBridge.error();
            } finally {
              await refreshAll();
            }
          },
        },
      ]
    );
  };

  return (
    <SettingsScreenLayout title="Account" subtitle="Connected platforms">
      <Text style={[styles.intro, { color: theme.text.secondary }]}>
        Connect platforms to sync your library, ratings and progress across
        Aniseekr and other clients.
      </Text>

      <SettingsSection title="Platforms">
        {PLATFORMS.map((platform, idx) => {
          const connected = !!connections[platform.id];
          return (
            <View key={platform.id}>
              <View style={styles.platformRow}>
                <View
                  style={[
                    styles.platformIcon,
                    { backgroundColor: platform.color + '24' },
                  ]}>
                  <MaterialIcons name={platform.icon} size={20} color={platform.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.platformName, { color: theme.text.primary }]}>
                    {platform.name}
                  </Text>
                  <Text
                    style={[
                      styles.platformStatus,
                      { color: connected ? '#30D158' : theme.text.tertiary },
                    ]}>
                    {connected ? 'Connected' : 'Not connected'}
                  </Text>
                </View>
                {connected ? (
                  <Pressable
                    onPress={() => handleDisconnect(platform)}
                    style={({ pressed }) => [
                      styles.actionButton,
                      {
                        borderColor: '#FF453A66',
                        backgroundColor: '#FF453A14',
                        opacity: pressed ? 0.7 : 1,
                      },
                    ]}>
                    <Text style={[styles.actionLabel, { color: '#FF453A' }]}>
                      Disconnect
                    </Text>
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={() => handleConnect(platform)}
                    disabled={loading}
                    style={({ pressed }) => [
                      styles.actionButton,
                      {
                        backgroundColor: theme.accent,
                        opacity: pressed || loading ? 0.7 : 1,
                      },
                    ]}>
                    <Text style={[styles.actionLabel, { color: '#0E0A06' }]}>
                      Connect
                    </Text>
                  </Pressable>
                )}
              </View>
              {idx < PLATFORMS.length - 1 ? (
                <View style={[styles.divider, { backgroundColor: theme.glassBorder }]} />
              ) : null}
            </View>
          );
        })}
      </SettingsSection>

      <SettingsSection title="Account actions">
        <SettingsRow
          icon="cloud-download"
          label="Refresh tokens"
          description="Re-pull authentication state from secure storage"
          onPress={() => {
            hapticsBridge.tap();
            refreshAll();
          }}
        />
      </SettingsSection>

      <Text style={[styles.footnote, { color: theme.text.tertiary }]}>
        Tokens live in your device's secure enclave. Reset them by uninstalling
        the app or revoking access in each platform's account settings.
      </Text>
    </SettingsScreenLayout>
  );
}

const styles = StyleSheet.create({
  intro: {
    ...Typography.bodyMedium,
    paddingHorizontal: 4,
  },
  platformRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.sm + 2,
  },
  platformIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  platformName: {
    ...Typography.titleMedium,
  },
  platformStatus: {
    ...Typography.bodySmall,
    marginTop: 2,
  },
  actionButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
  },
  actionLabel: {
    ...Typography.titleSmall,
    fontWeight: '700',
  },
  divider: {
    height: 1,
    marginLeft: 56,
  },
  footnote: {
    ...Typography.captionSmall,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
  },
});
