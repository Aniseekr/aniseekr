import { View, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState, useCallback } from 'react';
import {
  PLATFORM_CONFIGS,
  type PlatformAuthConfig,
  type PlatformType,
} from '../../libs/services/auth/types';
import {
  dataSourceConfig,
  BROWSE_SUPPORTED_PLATFORMS,
} from '../../libs/services/data-source-config';
import {
  dataSourceSwitchingCoordinator,
  type SwitchingState,
} from '../../libs/services/data-source-switching-coordinator';
import {
  SettingsScreenLayout,
  SettingsSection,
} from '../../components/setting/SettingsScreenLayout';
import { ThemedText, readableTextOn } from '../../components/themed';
import { Radius, Spacing } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { useT } from '../../libs/i18n';

export default function DataSourceScreen() {
  const t = useT();
  const { theme } = useTheme();
  const [browseSource, setBrowseSourceState] = useState<PlatformType>(
    dataSourceConfig.browseSource
  );
  const [switchingState, setSwitchingState] = useState<SwitchingState>(
    dataSourceSwitchingCoordinator.getState()
  );
  const [initLoading, setInitLoading] = useState(!dataSourceConfig.isInitialized);

  // Hydrate config on mount if not already initialized.
  useEffect(() => {
    let cancelled = false;
    if (!dataSourceConfig.isInitialized) {
      setInitLoading(true);
      dataSourceConfig
        .init()
        .then(() => {
          if (cancelled) return;
          setBrowseSourceState(dataSourceConfig.browseSource);
        })
        .finally(() => {
          if (cancelled) return;
          setInitLoading(false);
        });
    } else {
      setBrowseSourceState(dataSourceConfig.browseSource);
    }
    return () => {
      cancelled = true;
    };
  }, []);

  // Subscribe to coordinator transitions so the row spinner reflects state.
  useEffect(() => {
    const unsubscribe = dataSourceSwitchingCoordinator.subscribe((state) => {
      setSwitchingState(state);
      if (state.kind === 'completed') {
        setBrowseSourceState(state.source);
      }
    });
    return unsubscribe;
  }, []);

  const handleSelect = useCallback(
    async (platform: PlatformType) => {
      if (platform === browseSource) return;
      if (switchingState.kind === 'switching') return;

      const previous = browseSource;
      try {
        await dataSourceConfig.setBrowseSource(platform);
        setBrowseSourceState(platform);
        // Fire-and-forget; coordinator updates state via subscription.
        void dataSourceSwitchingCoordinator.beginSwitch(previous, platform);
      } catch (err) {
        console.warn('[DataSourceScreen] setBrowseSource failed', err);
      }
    },
    [browseSource, switchingState.kind]
  );

  const platforms: PlatformAuthConfig[] = BROWSE_SUPPORTED_PLATFORMS.map(
    (p) => PLATFORM_CONFIGS[p]
  );

  return (
    <SettingsScreenLayout title={t('settings.dataSourceScreen.title')}>
      <ThemedText variant="bodyMedium" tone="secondary">
        {t('settings.dataSourceScreen.description')}
      </ThemedText>

      {initLoading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={theme.text.primary} />
        </View>
      ) : (
        <SettingsSection>
          {platforms.map((platform, index) => {
            const isSelected = platform.platform === browseSource;
            const isSwitchingTo =
              switchingState.kind === 'switching' && switchingState.to === platform.platform;
            return (
              <View key={platform.platform}>
                <Pressable
                  onPress={() => handleSelect(platform.platform)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && { backgroundColor: theme.background.tertiary },
                  ]}
                  disabled={switchingState.kind === 'switching' || isSelected}>
                  <View style={[styles.iconTile, { backgroundColor: platform.color }]}>
                    <ThemedText
                      variant="titleSmall"
                      weight="800"
                      style={{ color: readableTextOn(platform.color) }}>
                      {platform.displayName.substring(0, 1)}
                    </ThemedText>
                  </View>
                  <View style={styles.rowText}>
                    <ThemedText variant="titleMedium">{platform.displayName}</ThemedText>
                    <ThemedText variant="bodySmall" tone={isSelected ? 'accent' : 'tertiary'}>
                      {isSelected
                        ? t('settings.dataSourceScreen.active')
                        : t('settings.dataSourceScreen.tapToUse')}
                    </ThemedText>
                  </View>
                  {isSwitchingTo ? (
                    <ActivityIndicator color={theme.text.primary} size="small" />
                  ) : isSelected ? (
                    <Ionicons name="checkmark-circle" size={22} color={theme.accent} />
                  ) : (
                    <Ionicons name="radio-button-off" size={22} color={theme.text.tertiary} />
                  )}
                </Pressable>
                {index < platforms.length - 1 ? (
                  <View style={[styles.separator, { backgroundColor: theme.glassBorder }]} />
                ) : null}
              </View>
            );
          })}
        </SettingsSection>
      )}

      {switchingState.kind === 'failed' ? (
        <ThemedText variant="bodySmall" tone="error">
          {t('settings.dataSourceScreen.switchFailed', {
            message: switchingState.error.message,
          })}
        </ThemedText>
      ) : null}
    </SettingsScreenLayout>
  );
}

const styles = StyleSheet.create({
  loadingRow: {
    paddingVertical: Spacing.xl,
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: Spacing.sm + 2,
  },
  iconTile: {
    width: 32,
    height: 32,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
  },
  separator: {
    height: 1,
    marginLeft: 56,
  },
});
