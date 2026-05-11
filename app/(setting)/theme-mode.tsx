import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import Slider from '@react-native-community/slider';
import Ionicons from '@expo/vector-icons/Ionicons';
import { TintIntensity, ThemeMode, useTheme } from '../../context/ThemeContext';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import { ThemedSurface, ThemedText, readableTextOn } from '../../components/themed';

// Mockup palette for the ModeCard previews. These are intentionally fixed
// hex values that represent what light vs. dark mode look like — they do NOT
// react to the active theme, because the preview's job is to show the user
// what each mode will become.
const MOCK_PALETTE = {
  lightCanvas: '#F5EDF8',
  lightSurface: '#FFFFFF',
  lightHeader: '#1A1A2E',
  lightSubText: '#6B5B7B',
  darkCanvas: '#0A0F1C',
  darkSurface: '#1E293B',
  darkHeader: '#FFFFFF',
  darkSubText: '#94A3B8',
} as const;

const MODES: { id: ThemeMode; label: string; canvas: string; surface: string }[] = [
  { id: 'light', label: 'Light', canvas: MOCK_PALETTE.lightCanvas, surface: MOCK_PALETTE.lightSurface },
  { id: 'dark', label: 'Dark', canvas: MOCK_PALETTE.darkCanvas, surface: MOCK_PALETTE.darkSurface },
  { id: 'auto', label: 'Auto', canvas: MOCK_PALETTE.lightCanvas, surface: MOCK_PALETTE.darkCanvas },
];

const TINT_STEPS: TintIntensity[] = ['subtle', 'balanced', 'vivid'];

export default function ThemeModeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    theme,
    themeMode,
    setThemeMode,
    tintIntensity,
    setTintIntensity,
    increaseContrast,
    setIncreaseContrast,
  } = useTheme();

  const accent = theme.accent;
  const tintIndex = useMemo(() => TINT_STEPS.indexOf(tintIntensity), [tintIntensity]);

  const surfaceTokens = useMemo(
    () => [
      { name: 'Background', hex: theme.background.primary, description: 'App background base' },
      { name: 'Card', hex: theme.background.secondary, description: 'Tile & list surface' },
      { name: 'Elevated', hex: theme.background.tertiary, description: 'Sheets & modals' },
      { name: 'Border', hex: theme.glassBorder, description: 'Divider & outline' },
    ],
    [theme.background.primary, theme.background.secondary, theme.background.tertiary, theme.glassBorder]
  );

  return (
    <View style={[styles.root, { backgroundColor: theme.background.primary }]}>
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
            Theme Mode
          </ThemedText>
          <View style={{ width: 80 }} />
        </View>

        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}>
          <SectionHeader>APPEARANCE</SectionHeader>
          <View style={styles.modeRow}>
            {MODES.map((m) => (
              <ModeCard
                key={m.id}
                mode={m}
                selected={themeMode === m.id}
                onPress={() => {
                  hapticsBridge.selection();
                  void setThemeMode(m.id);
                }}
              />
            ))}
          </View>

          <SectionHeader>SURFACE COLORS</SectionHeader>
          <ThemedSurface variant="card">
            {surfaceTokens.map((t, idx) => (
              <View key={t.name}>
                <View style={styles.surfaceRow}>
                  <View
                    style={[
                      styles.surfaceSwatch,
                      { backgroundColor: t.hex, borderColor: theme.glassBorder },
                    ]}
                  />
                  <View style={{ flex: 1 }}>
                    <ThemedText variant="bodyMedium" weight="500">
                      {t.name}
                    </ThemedText>
                    <ThemedText variant="bodySmall" tone="secondary">
                      {t.description}
                    </ThemedText>
                  </View>
                  <View style={styles.surfaceRight}>
                    <ThemedText variant="bodySmall" tone="secondary" weight="500">
                      {t.hex.toUpperCase()}
                    </ThemedText>
                  </View>
                </View>
                {idx < surfaceTokens.length - 1 ? (
                  <View style={[styles.separator, { backgroundColor: theme.glassBorder }]} />
                ) : null}
              </View>
            ))}
          </ThemedSurface>

          <SectionHeader>ACCENT TINT INTENSITY</SectionHeader>
          <ThemedSurface variant="card" padded>
            <View style={styles.tintHead}>
              <View style={{ flex: 1 }}>
                <ThemedText variant="titleMedium" weight="600">
                  {capitalize(tintIntensity)}
                </ThemedText>
                <ThemedText variant="bodySmall" tone="secondary">
                  {tintSubtitle(tintIntensity)}
                </ThemedText>
              </View>
              <View
                style={[
                  styles.sampleChip,
                  { backgroundColor: accent + '22', borderColor: accent },
                ]}>
                <View style={[styles.sampleDot, { backgroundColor: accent }]} />
                <ThemedText variant="bodySmall" weight="600" style={{ color: accent }}>
                  Sample
                </ThemedText>
              </View>
            </View>
            <Slider
              minimumValue={0}
              maximumValue={2}
              step={1}
              value={tintIndex}
              onValueChange={(v) => {
                const next = TINT_STEPS[Math.round(v)] ?? 'balanced';
                if (next !== tintIntensity) {
                  hapticsBridge.selection();
                  void setTintIntensity(next);
                }
              }}
              minimumTrackTintColor={accent}
              maximumTrackTintColor={theme.glassBorder}
              thumbTintColor={theme.text.primary}
              style={styles.slider}
            />
            <View style={styles.marksRow}>
              {TINT_STEPS.map((s) => (
                <ThemedText
                  key={s}
                  variant="captionSmall"
                  tone={s === tintIntensity ? 'accent' : 'tertiary'}
                  weight={s === tintIntensity ? '600' : '500'}>
                  {capitalize(s)}
                </ThemedText>
              ))}
            </View>
          </ThemedSurface>

          <SectionHeader>CONTRAST</SectionHeader>
          <ThemedSurface variant="card" padded>
            <View style={styles.toggleRow}>
              <View style={{ flex: 1 }}>
                <ThemedText variant="titleMedium" weight="500">
                  Increase Contrast
                </ThemedText>
                <ThemedText variant="bodySmall" tone="secondary">
                  Sharper text and borders
                </ThemedText>
              </View>
              <Switch
                value={increaseContrast}
                onValueChange={(v) => {
                  hapticsBridge.selection();
                  void setIncreaseContrast(v);
                }}
                trackColor={{ false: theme.background.tertiary, true: accent }}
                thumbColor={theme.text.primary}
              />
            </View>
          </ThemedSurface>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function SectionHeader({ children }: { children: string }) {
  return (
    <ThemedText
      variant="captionSmall"
      tone="tertiary"
      weight="600"
      style={styles.sectionHeader}>
      {children}
    </ThemedText>
  );
}

function ModeCard({
  mode,
  selected,
  onPress,
}: {
  mode: (typeof MODES)[number];
  selected: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const accent = theme.accent;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${mode.label} mode`}
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.modeCard,
        {
          backgroundColor: theme.background.secondary,
          borderColor: selected ? accent : theme.glassBorder,
          borderWidth: selected ? 2 : 1,
        },
        pressed && { opacity: 0.85 },
      ]}>
      <View style={styles.modePreview}>
        {mode.id === 'auto' ? (
          <View style={{ flex: 1, flexDirection: 'row' }}>
            <View style={[styles.modeMini, { backgroundColor: mode.canvas }]}>
              <MiniPreview tone="light" />
            </View>
            <View style={[styles.modeMini, { backgroundColor: mode.surface }]}>
              <MiniPreview tone="dark" />
            </View>
          </View>
        ) : (
          <View style={[styles.modeMiniFull, { backgroundColor: mode.canvas }]}>
            <MiniPreview tone={mode.id === 'dark' ? 'dark' : 'light'} />
          </View>
        )}
      </View>
      <View style={styles.modeFooter}>
        <ThemedText
          variant="titleSmall"
          tone={selected ? 'accent' : 'primary'}
          weight={selected ? '700' : '600'}>
          {mode.label}
        </ThemedText>
        {selected ? (
          <View style={[styles.modeCheck, { backgroundColor: accent }]}>
            <Ionicons name="checkmark" size={10} color={readableTextOn(accent)} />
          </View>
        ) : (
          <View
            style={[
              styles.modeCheck,
              { backgroundColor: theme.background.primary, borderColor: theme.glassBorder, borderWidth: 1.5 },
            ]}
          />
        )}
      </View>
    </Pressable>
  );
}

function MiniPreview({ tone }: { tone: 'light' | 'dark' }) {
  const headerBar = tone === 'light' ? MOCK_PALETTE.lightHeader : MOCK_PALETTE.darkHeader;
  const subBar = tone === 'light' ? MOCK_PALETTE.lightSubText : MOCK_PALETTE.darkSubText;
  const rowBg = tone === 'light' ? MOCK_PALETTE.lightSurface : MOCK_PALETTE.darkSurface;
  return (
    <View style={{ flex: 1, padding: 6, gap: 4 }}>
      <View style={{ height: 5, backgroundColor: headerBar, borderRadius: 2, width: '70%' }} />
      <View style={{ height: 3, backgroundColor: subBar, borderRadius: 1, width: '50%' }} />
      <View style={{ height: 14, backgroundColor: rowBg, borderRadius: 3, marginTop: 4 }} />
      <View style={{ height: 14, backgroundColor: rowBg, borderRadius: 3 }} />
    </View>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function tintSubtitle(t: TintIntensity) {
  switch (t) {
    case 'subtle':
      return 'Calmer accent backgrounds';
    case 'vivid':
      return 'Stronger pops of color';
    default:
      return 'Default accent intensity';
  }
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 48,
  },
  navBack: { flexDirection: 'row', alignItems: 'center', gap: 2, minWidth: 80 },
  scroll: { padding: 20, gap: 16 },
  sectionHeader: { letterSpacing: 1.5 },
  modeRow: { flexDirection: 'row', gap: 8 },
  modeCard: {
    flex: 1,
    height: 170,
    borderRadius: 18,
    padding: 8,
    gap: 8,
    overflow: 'hidden',
  },
  modePreview: {
    flex: 1,
    borderRadius: 10,
    overflow: 'hidden',
  },
  modeMiniFull: { flex: 1 },
  modeMini: { flex: 1 },
  modeFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  modeCheck: {
    width: 14,
    height: 14,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  surfaceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  surfaceSwatch: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
  },
  surfaceRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  separator: { height: 1 },
  tintHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sampleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  sampleDot: { width: 8, height: 8, borderRadius: 4 },
  slider: { width: '100%', marginTop: 18 },
  marksRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
