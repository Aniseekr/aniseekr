import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Radius, Spacing } from '../../constants/DesignSystem';
import { FeatureFlags } from '../../constants/FeatureFlags';
import { useSubscription } from '../../context/SubscriptionContext';
import { useTheme, type ThemeMode } from '../../context/ThemeContext';
import { PaywallSheet } from '../../components/subscription/PaywallSheet';
import { EditDisplayNameSheet } from '../../components/profile/EditDisplayNameSheet';
import {
  SettingsRow,
  SettingsScreenLayout,
  SettingsSection,
} from '../../components/setting/SettingsScreenLayout';
import { ThemedSurface, ThemedSwitch, ThemedText, readableTextOn } from '../../components/themed';
import { AniseekrLogo } from '../../components/brand/AniseekrLogo';
import { SEEKR_POSES } from '../../components/brand/SeekrPose';
import { supportsAlternateIcons } from '../../libs/brand/app-icon';
import { useT } from '../../libs/i18n';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import {
  loadUserPrefsSync,
  patchUserPrefs,
  subscribeUserPrefs,
  type UserPrefs,
} from '../../libs/services/user-prefs';
import { UserRepository, type UserProfile } from '../../libs/repositories/user-repository';
import { authService } from '../../libs/services/auth/auth-service';

const THEME_MODE_LABEL_KEY = {
  light: 'settingsUi.light',
  dark: 'settingsUi.dark',
  auto: 'commonUi.auto',
} as const satisfies Record<ThemeMode, string>;

export default function SettingsScreen() {
  const subscription = useSubscription();
  const t = useT();
  const { theme, themeId, themeMode, themes } = useTheme();

  const [prefs, setPrefs] = useState<UserPrefs>(loadUserPrefsSync);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [nameSheetVisible, setNameSheetVisible] = useState(false);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [connectedCount, setConnectedCount] = useState(0);

  const appVersion =
    Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? '1.0.0';

  // Prefs are seeded synchronously above; this catches edits made on sub-pages.
  useEffect(() => subscribeUserPrefs(setPrefs), []);

  // Rule 10: silent revalidation on re-focus (e.g. back from Account) — never
  // clear state or flash a skeleton, just overwrite when fresh values land.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void (async () => {
        try {
          const next = await UserRepository.getProfile();
          if (!cancelled) setUser(next);
        } catch {
          // keep showing whatever we last had
        }
        try {
          await authService.initialize();
          if (!cancelled) setConnectedCount(authService.getAllCredentials().length);
        } catch {
          // keep the last count
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [])
  );

  const updatePref = async <K extends keyof UserPrefs>(
    key: K,
    value: UserPrefs[K]
  ): Promise<void> => {
    const next = await patchUserPrefs({ [key]: value } as Partial<UserPrefs>);
    setPrefs(next);
  };

  const handleAdultToggle = async (nextOn: boolean) => {
    if (!nextOn) {
      await updatePref('allowAdultContent', false);
      return;
    }
    const hasHw = await LocalAuthentication.hasHardwareAsync();
    const enrolled = hasHw && (await LocalAuthentication.isEnrolledAsync());
    if (enrolled) {
      const res = await LocalAuthentication.authenticateAsync({
        promptMessage: t('settings.adultContentAuthPrompt'),
        cancelLabel: t('common.cancel'),
      });
      if (res.success) await updatePref('allowAdultContent', true);
      return;
    }
    Alert.alert(
      t('settingsUi.enableAdultContentAreYouTitle'),
      t('settingsUi.enableAdultContentAreYouMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.prefs.enableR18'),
          style: 'destructive',
          onPress: () => {
            void updatePref('allowAdultContent', true);
          },
        },
      ]
    );
  };

  const handleSaveName = useCallback(async (name: string) => {
    await UserRepository.setDisplayName(name);
    setUser(await UserRepository.getProfile());
  }, []);

  const isPro = subscription.isPro;
  const activeThemeName = themes.find((option) => option.id === themeId)?.name ?? 'Aniseekr';
  const displayName = user?.username || t('tabs.profileScreen.anonName');
  const avatarUri = user?.avatarUrl ?? '';
  const open = (route: Parameters<typeof router.push>[0]) => () => router.push(route);

  return (
    <>
      <SettingsScreenLayout title={t('settings.title')}>
        <Pressable
          onPress={() => {
            hapticsBridge.tap();
            setNameSheetVisible(true);
          }}
          style={({ pressed }) => pressed && styles.pressed}
          accessibilityRole="button"
          accessibilityLabel={t('settingsUi.editProfileName')}>
          <ThemedSurface style={styles.userCard}>
            <View
              style={[
                styles.avatar,
                { backgroundColor: theme.background.primary, borderColor: theme.accent },
              ]}>
              <Image
                source={avatarUri ? { uri: avatarUri } : SEEKR_POSES[prefs.profileMascot]}
                style={styles.avatarImage}
                contentFit="cover"
                contentPosition="top"
              />
            </View>
            <View style={styles.nameRow}>
              <ThemedText variant="titleLarge" weight="700" numberOfLines={1} style={styles.name}>
                {displayName}
              </ThemedText>
              {FeatureFlags.PREMIUM_ENABLED && isPro ? (
                <View style={[styles.proBadge, { backgroundColor: theme.accent }]}>
                  <ThemedText
                    variant="captionSmall"
                    weight="800"
                    style={{ color: readableTextOn(theme.accent) }}>
                    PRO
                  </ThemedText>
                </View>
              ) : null}
            </View>
            <ThemedText variant="caption" tone="secondary" weight="700">
              {t('common.edit')}
            </ThemedText>
          </ThemedSurface>
        </Pressable>

        <SettingsSection title={t('settings.sections.accountSync')} divided>
          {FeatureFlags.PREMIUM_ENABLED ? (
            <SettingsRow
              icon="workspace-premium"
              label={isPro ? t('settings.premium.active') : t('settings.premium.unlock')}
              onPress={isPro ? open('/(setting)/subscription') : () => setPaywallVisible(true)}
            />
          ) : null}
          <SettingsRow
            icon="people"
            label={t('settings.connectedPlatforms')}
            value={connectedCount > 0 ? `${connectedCount}` : t('settings.connectedNone')}
            onPress={open('/(setting)/account')}
          />
          <SettingsRow
            icon="sync"
            label={t('settings.syncHub')}
            onPress={open('/(setting)/sync-hub')}
          />
          <SettingsRow
            icon="file-upload"
            label={t('settings.importWizard.title')}
            onPress={open('/(setting)/import-wizard')}
          />
          <SettingsRow
            icon="cloud-upload"
            label={t('settings.backup')}
            onPress={open('/(setting)/backup')}
          />
          <SettingsRow
            icon="emoji-events"
            label={t('settings.achievements')}
            onPress={open('/(setting)/achievements')}
          />
        </SettingsSection>

        <SettingsSection title={t('settings.sections.content')} divided>
          <SettingsRow
            icon="cloud-queue"
            label={t('settings.browseSource')}
            onPress={open('/(setting)/data-source')}
          />
          <SettingsRow
            icon="play-circle-outline"
            label={t('settings.watchPlatforms')}
            description={
              prefs.streamingPlatforms.enabled.length > 0
                ? t('settings.watchPlatformsSummary', {
                    count: prefs.streamingPlatforms.enabled.length,
                    primary:
                      prefs.streamingPlatforms.primary ?? t('settings.watchPlatformsNoPrimary'),
                  })
                : undefined
            }
            onPress={open('/(setting)/watch-platforms')}
          />
          <SettingsRow
            icon="warning-amber"
            label={t('settings.prefs.allowR18')}
            rightSlot={
              <ThemedSwitch
                accessibilityLabel={t('settings.prefs.allowR18')}
                value={prefs.allowAdultContent}
                onValueChange={(next) => void handleAdultToggle(next)}
              />
            }
          />
          <SettingsRow
            icon="sports-esports"
            label={t('settings.prefs.includeGames')}
            description={t('settings.prefs.includeGamesDesc')}
            rightSlot={
              <ThemedSwitch
                accessibilityLabel={t('settings.prefs.includeGames')}
                value={prefs.bangumiIncludeGames}
                onValueChange={(next) => void updatePref('bangumiIncludeGames', next)}
              />
            }
          />
          <SettingsRow
            icon="star-outline"
            label={t('settings.prefs.showScore')}
            description={t('settings.prefs.showScoreDesc')}
            rightSlot={
              <ThemedSwitch
                accessibilityLabel={t('settings.prefs.showScore')}
                value={prefs.bangumiShowScoreProminently}
                onValueChange={(next) => void updatePref('bangumiShowScoreProminently', next)}
              />
            }
          />
        </SettingsSection>

        <SettingsSection title={t('settings.sections.appearance')} divided>
          <SettingsRow
            icon="palette"
            label={t('settings.appearanceTitle')}
            description={`${activeThemeName} · ${t(THEME_MODE_LABEL_KEY[themeMode])}`}
            onPress={open('/(setting)/appearance')}
          />
          <SettingsRow
            icon="translate"
            label={t('settings.language')}
            onPress={open('/(setting)/language')}
          />
          {supportsAlternateIcons ? (
            <SettingsRow
              icon="apps"
              label={t('brand.appIcon.title')}
              onPress={open('/(setting)/app-icon')}
            />
          ) : null}
        </SettingsSection>

        <SettingsSection title={t('settings.sections.notificationsStorage')} divided>
          <SettingsRow
            icon="notifications-none"
            label={t('settings.reminders')}
            onPress={open('/(setting)/notifications')}
          />
          <SettingsRow
            icon="storage"
            label={t('settings.cache')}
            onPress={open('/(setting)/cache')}
          />
        </SettingsSection>

        <SettingsSection title={t('settings.sections.about')} divided>
          <SettingsRow
            icon="favorite-border"
            label={t('settings.attribution')}
            onPress={open('/(setting)/attribution')}
          />
          <SettingsRow
            icon="lock-outline"
            label={t('settings.privacyLong')}
            onPress={open('/(setting)/privacy')}
          />
          <SettingsRow
            icon="description"
            label={t('settings.termsLong')}
            onPress={open('/(setting)/terms')}
          />
          <SettingsRow
            icon="build"
            label={t('settings.advanced.title')}
            onPress={open('/(setting)/advanced')}
          />
        </SettingsSection>

        <View style={styles.brandFooter}>
          <AniseekrLogo height={34} />
          <ThemedText variant="bodySmall" tone="secondary" align="center">
            {t('brand.tagline')}
          </ThemedText>
          <ThemedText variant="caption" tone="tertiary" align="center">
            {t('settings.version', { version: appVersion })}
          </ThemedText>
        </View>
      </SettingsScreenLayout>

      <PaywallSheet visible={paywallVisible} onClose={() => setPaywallVisible(false)} />
      <EditDisplayNameSheet
        visible={nameSheetVisible}
        currentName={user?.username ?? ''}
        onClose={() => setNameSheetVisible(false)}
        onSave={handleSaveName}
      />
    </>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.85 },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: Radius.full,
    borderWidth: 2,
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  nameRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  name: { flexShrink: 1 },
  proBadge: {
    paddingHorizontal: Spacing.xs,
    paddingVertical: Spacing.xxs,
    borderRadius: Radius.sm,
  },
  brandFooter: {
    marginTop: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.xs,
  },
});
