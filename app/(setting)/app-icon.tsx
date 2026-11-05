// App icon picker — Seekr's v6 home-screen looks. The default (null) is the
// "peek" icon from app.json; the others are the alternates registered by the
// expo-alternate-app-icons plugin entry in app.json (names must match it).

import { useCallback, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  getAppIconName,
  setAppIcon,
  supportsAlternateIcons,
  type AppIconName,
} from '../../libs/brand/app-icon';
import { Radius, Spacing } from '../../constants/DesignSystem';
import { useSubscription } from '../../context/SubscriptionContext';
import { useTheme } from '../../context/ThemeContext';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import { SettingsScreenLayout } from '../../components/setting/SettingsScreenLayout';
import { ThemedText, readableTextOn } from '../../components/themed';
import { PaywallSheet } from '../../components/subscription/PaywallSheet';
import { useT, type TranslationKey } from '../../libs/i18n';

const ICONS: { name: AppIconName | null; label: TranslationKey; thumb: number }[] = [
  {
    name: null,
    label: 'brand.appIcon.names.default',
    thumb: require('../../assets/app-icons/default-thumb.png'),
  },
  {
    name: 'NightLines',
    label: 'brand.appIcon.names.nightLines',
    thumb: require('../../assets/app-icons/night-lines-thumb.png'),
  },
  {
    name: 'OneEye',
    label: 'brand.appIcon.names.oneEye',
    thumb: require('../../assets/app-icons/one-eye-thumb.png'),
  },
  {
    name: 'MangaOrange',
    label: 'brand.appIcon.names.mangaOrange',
    thumb: require('../../assets/app-icons/manga-orange-thumb.png'),
  },
  {
    name: 'MangaNight',
    label: 'brand.appIcon.names.mangaNight',
    thumb: require('../../assets/app-icons/manga-night-thumb.png'),
  },
];

// One per premium theme skin (ThemeSkin.appIcon). Pro, like the themes.
const THEME_ICONS: { name: AppIconName; label: TranslationKey; thumb: number }[] = [
  {
    name: 'Washi',
    label: 'brand.appIcon.names.washi',
    thumb: require('../../assets/app-icons/washi-thumb.png'),
  },
  {
    name: 'Screentone',
    label: 'brand.appIcon.names.screentone',
    thumb: require('../../assets/app-icons/screentone-thumb.png'),
  },
  {
    name: 'Twilight',
    label: 'brand.appIcon.names.twilight',
    thumb: require('../../assets/app-icons/twilight-thumb.png'),
  },
  {
    name: 'Yozakura',
    label: 'brand.appIcon.names.yozakura',
    thumb: require('../../assets/app-icons/yozakura-thumb.png'),
  },
  {
    name: 'Cel',
    label: 'brand.appIcon.names.cel',
    thumb: require('../../assets/app-icons/cel-thumb.png'),
  },
  {
    name: 'Natsuzora',
    label: 'brand.appIcon.names.natsuzora',
    thumb: require('../../assets/app-icons/natsuzora-thumb.png'),
  },
];

const THUMB = 76;

export default function AppIconScreen() {
  const { theme } = useTheme();
  const t = useT();
  const { isPro } = useSubscription();
  const [current, setCurrent] = useState<string | null>(getAppIconName);
  const [busy, setBusy] = useState(false);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const matching = theme.skin?.appIcon ?? null;

  const apply = useCallback(
    async (name: AppIconName | null) => {
      setBusy(true);
      try {
        const applied = await setAppIcon(name);
        setCurrent(applied);
        hapticsBridge.success();
      } catch {
        hapticsBridge.error();
        Alert.alert(t('brand.appIcon.failed'));
      } finally {
        setBusy(false);
      }
    },
    [t]
  );

  const onPick = useCallback(
    (name: AppIconName | null) => {
      if (busy || name === current) return;
      hapticsBridge.selection();
      if (Platform.OS !== 'android') {
        void apply(name);
        return;
      }
      // Android swaps the launcher activity-alias, which usually closes the app.
      Alert.alert(t('brand.appIcon.androidTitle'), t('brand.appIcon.androidBody'), [
        { text: t('brand.appIcon.cancel'), style: 'cancel' },
        { text: t('brand.appIcon.confirm'), onPress: () => void apply(name) },
      ]);
    },
    [apply, busy, current, t]
  );

  const renderTile = (
    icon: { name: AppIconName | null; label: TranslationKey; thumb: number },
    locked: boolean
  ) => {
    const selected = icon.name === current;
    const matches = icon.name !== null && icon.name === matching;
    return (
      <Pressable
        key={icon.label}
        onPress={() => {
          if (!locked) return onPick(icon.name);
          hapticsBridge.warning();
          setPaywallVisible(true);
        }}
        disabled={busy}
        accessibilityRole="radio"
        accessibilityState={{ selected, disabled: busy }}
        accessibilityLabel={t(icon.label)}
        style={({ pressed }) => [
          styles.tile,
          {
            backgroundColor: theme.background.secondary,
            borderColor: selected ? theme.accent : theme.glassBorder,
            opacity: pressed ? 0.85 : 1,
          },
        ]}>
        <Image source={icon.thumb} style={styles.thumb} contentFit="cover" />
        <ThemedText variant="bodySmall" align="center" numberOfLines={1}>
          {t(icon.label)}
        </ThemedText>
        {matches ? (
          <ThemedText variant="captionSmall" tone="accent" align="center" numberOfLines={1}>
            {t('brand.appIcon.matchesTheme')}
          </ThemedText>
        ) : null}
        {selected ? (
          <View style={[styles.badge, { backgroundColor: theme.accent }]}>
            <Ionicons name="checkmark" size={14} color={readableTextOn(theme.accent)} />
          </View>
        ) : locked ? (
          <View style={[styles.badge, { backgroundColor: theme.background.tertiary }]}>
            <Ionicons name="lock-closed" size={12} color={theme.text.secondary} />
          </View>
        ) : null}
      </Pressable>
    );
  };

  return (
    <SettingsScreenLayout title={t('brand.appIcon.title')} subtitle={t('brand.appIcon.subtitle')}>
      {supportsAlternateIcons ? (
        <>
          <View style={styles.grid}>{ICONS.map((icon) => renderTile(icon, false))}</View>
          <ThemedText variant="captionSmall" tone="tertiary" weight="600" style={styles.heading}>
            {`${t('brand.appIcon.themeIcons')} · Pro`}
          </ThemedText>
          <View style={styles.grid}>
            {THEME_ICONS.map((icon) => renderTile(icon, !isPro && icon.name !== current))}
          </View>
        </>
      ) : (
        <ThemedText variant="bodyMedium" tone="secondary">
          {t('brand.appIcon.unsupported')}
        </ThemedText>
      )}
      <PaywallSheet visible={paywallVisible} onClose={() => setPaywallVisible(false)} />
    </SettingsScreenLayout>
  );
}

const styles = StyleSheet.create({
  heading: { marginTop: Spacing.lg, marginBottom: Spacing.sm },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  tile: {
    width: '31%',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xs,
    borderRadius: Radius.lg,
    borderWidth: 2,
  },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB * 0.225,
  },
  badge: {
    position: 'absolute',
    top: Spacing.xs,
    right: Spacing.xs,
    width: 22,
    height: 22,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
