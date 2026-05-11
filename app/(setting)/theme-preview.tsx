import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme, type ThemePalette } from '../../context/ThemeContext';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import { ThemedButton, ThemedText, readableTextOn } from '../../components/themed';

export default function ThemePreviewScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const accent = theme.accent;
  const accentFg = readableTextOn(accent);

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={styles.navBar}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Back to settings"
            style={({ pressed }) => [styles.navBack, pressed && { opacity: 0.6 }]}>
            <Ionicons name="chevron-back" size={22} color={theme.text.primary} />
            <ThemedText variant="bodyMedium" weight="500">
              Settings
            </ThemedText>
          </Pressable>
          <ThemedText variant="titleLarge" weight="600">
            Live Preview
          </ThemedText>
          <Pressable
            onPress={() => {
              hapticsBridge.tap();
              router.push('/(setting)/accent-color');
            }}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Switch accent color"
            style={({ pressed }) => [
              styles.switchPill,
              { borderColor: accent },
              pressed && { opacity: 0.7 },
            ]}>
            <View style={[styles.pillDot, { backgroundColor: accent }]} />
            <ThemedText variant="captionSmall" weight="600" style={{ color: accent }}>
              Switch
            </ThemedText>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}>
          {/* Hero card */}
          <View style={styles.heroCard}>
            <LinearGradient
              colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.85)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={styles.heroGradient}>
              <View style={styles.heroTop}>
                <View style={[styles.heroBadge, { backgroundColor: accent + 'DD' }]}>
                  <Ionicons name="star" size={10} color={accentFg} />
                  <ThemedText variant="captionSmall" weight="700" style={{ color: accentFg }}>
                    Featured Today
                  </ThemedText>
                </View>
              </View>
              <View style={styles.heroBottom}>
                <View style={{ flex: 1 }}>
                  <ThemedText variant="titleLarge" weight="800">
                    Demon Slayer: Hashira Arc
                  </ThemedText>
                  <ThemedText variant="bodySmall" tone="secondary" style={{ marginTop: 4 }}>
                    S4 · E12 · 24 min
                  </ThemedText>
                </View>
                <ThemedButton
                  label="Watch Now"
                  onPress={() => hapticsBridge.tap()}
                  size="sm"
                  shape="rounded"
                  icon={<Ionicons name="play" size={14} color={accentFg} />}
                />
              </View>
            </LinearGradient>
          </View>

          {/* Filter chips */}
          <View style={styles.chipsRow}>
            <Chip label="Action" active />
            <Chip label="Romance" />
            <Chip label="SF" />
          </View>

          {/* Progress card */}
          <View style={styles.progressCard}>
            <View style={styles.progressRow}>
              <View style={[styles.progressRing, { borderColor: accent + '40' }]}>
                <View
                  style={[
                    styles.progressArc,
                    { borderColor: 'transparent', borderTopColor: accent, borderRightColor: accent },
                  ]}
                />
                <ThemedText variant="captionSmall" weight="700" style={{ color: accent }}>
                  50%
                </ThemedText>
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText variant="captionSmall" tone="secondary" weight="500">
                  Currently Watching
                </ThemedText>
                <ThemedText variant="titleMedium" weight="700" style={{ marginTop: 2 }}>
                  Ep 12 / 24
                </ThemedText>
                <ThemedText variant="bodySmall" tone="secondary" style={{ marginTop: 2 }}>
                  Next: Pillar Showdown
                </ThemedText>
              </View>
            </View>
          </View>

          {/* Button row — actual ThemedButton variants */}
          <View style={styles.buttonRow}>
            <ThemedButton label="Primary" onPress={() => hapticsBridge.tap()} size="sm" shape="rounded" />
            <ThemedButton
              variant="outline"
              label="Outline"
              onPress={() => hapticsBridge.tap()}
              size="sm"
              shape="rounded"
            />
            <ThemedButton
              variant="ghost"
              label="Ghost"
              onPress={() => hapticsBridge.tap()}
              size="sm"
              shape="rounded"
            />
          </View>

          {/* Badge row */}
          <View style={styles.badgeRow}>
            <View style={[styles.badge, { backgroundColor: accent + '20', borderColor: accent }]}>
              <ThemedText variant="captionSmall" weight="700" style={{ color: accent }}>
                NEW
              </ThemedText>
            </View>
            <View style={[styles.badge, { backgroundColor: accent + '14', borderColor: accent + '55' }]}>
              <Ionicons name="trending-up" size={11} color={accent} />
              <ThemedText variant="captionSmall" weight="700" style={{ color: accent }}>
                Trending
              </ThemedText>
            </View>
            <View
              style={[
                styles.badge,
                { backgroundColor: theme.background.secondary, borderColor: theme.glassBorder },
              ]}>
              <Ionicons name="star" size={11} color={accent} />
              <ThemedText variant="captionSmall" weight="700">
                8.2
              </ThemedText>
            </View>
          </View>
        </ScrollView>

        {/* Mock tab bar */}
        <View
          style={[
            styles.tabBar,
            {
              paddingBottom: Math.max(insets.bottom, 12),
              backgroundColor: theme.background.tertiary,
              borderTopColor: theme.glassBorder,
            },
          ]}>
          <TabItem label="Home" icon="home" active />
          <TabItem label="Search" icon="search" />
          <TabItem label="Library" icon="bookmark" />
          <TabItem label="Profile" icon="person" />
        </View>
      </SafeAreaView>
    </View>
  );
}

function Chip({ label, active }: { label: string; active?: boolean }) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const accent = theme.accent;
  const accentFg = readableTextOn(accent);
  return (
    <View
      style={[
        styles.chip,
        active
          ? { backgroundColor: accent, borderColor: accent }
          : { backgroundColor: theme.background.secondary, borderColor: theme.glassBorder },
      ]}>
      <ThemedText
        variant="bodySmall"
        weight="600"
        style={{ color: active ? accentFg : theme.text.primary }}>
        {label}
      </ThemedText>
    </View>
  );
}

function TabItem({
  label,
  icon,
  active,
}: {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  active?: boolean;
}) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const color = active ? theme.accent : theme.text.tertiary;
  return (
    <View style={styles.tabItem}>
      <Ionicons name={icon} size={20} color={color} />
      <ThemedText variant="captionSmall" weight="500" style={{ color }}>
        {label}
      </ThemedText>
    </View>
  );
}

function makeStyles(theme: ThemePalette) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.background.primary },
    navBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      height: 52,
    },
    navBack: { flexDirection: 'row', alignItems: 'center', gap: 2, minWidth: 100 },
    switchPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
      minWidth: 100,
      justifyContent: 'center',
    },
    pillDot: { width: 8, height: 8, borderRadius: 4 },
    scroll: { padding: 16, gap: 14 },
    heroCard: {
      height: 200,
      borderRadius: 20,
      overflow: 'hidden',
      backgroundColor: theme.background.secondary,
      borderWidth: 1,
      borderColor: theme.glassBorder,
    },
    heroGradient: {
      flex: 1,
      justifyContent: 'space-between',
      padding: 14,
      backgroundColor: 'rgba(0,0,0,0.3)',
    },
    heroTop: { flexDirection: 'row' },
    heroBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
    },
    heroBottom: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
    chipsRow: { flexDirection: 'row', gap: 8 },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
    },
    progressCard: {
      backgroundColor: theme.background.secondary,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.glassBorder,
      padding: 16,
    },
    progressRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    progressRing: {
      width: 64,
      height: 64,
      borderRadius: 32,
      borderWidth: 6,
      alignItems: 'center',
      justifyContent: 'center',
    },
    progressArc: {
      position: 'absolute',
      width: 64,
      height: 64,
      borderRadius: 32,
      borderWidth: 6,
      transform: [{ rotate: '-45deg' }],
    },
    buttonRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      borderWidth: 1,
    },
    tabBar: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      alignItems: 'center',
      borderTopWidth: 1,
      paddingTop: 10,
    },
    tabItem: { alignItems: 'center', gap: 4 },
  });
}
