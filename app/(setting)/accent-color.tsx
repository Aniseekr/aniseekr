import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  ACCENT_GRADIENTS,
  ACCENT_PRESETS,
  AccentGradient,
  AccentPreset,
  useTheme,
} from '../../context/ThemeContext';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import { ScreenHeader, ThemedButton, ThemedText, readableTextOn } from '../../components/themed';
import { useT } from '../../libs/i18n';
import { Radius } from '../../constants/DesignSystem';

export default function AccentColorScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
  const { theme, customAccent, setCustomAccent, recentAccents } = useTheme();
  const initial = customAccent ?? theme.accent.toUpperCase();
  const [pending, setPending] = useState<string>(initial);

  useEffect(() => {
    setPending(customAccent ?? theme.accent.toUpperCase());
  }, [customAccent, theme.accent]);

  const dirty = pending.toUpperCase() !== initial.toUpperCase();

  const handleSelect = (hex: string) => {
    hapticsBridge.selection();
    setPending(hex.toUpperCase());
  };

  const handleApply = async () => {
    hapticsBridge.success();
    await setCustomAccent(pending);
    router.back();
  };

  const handleReset = async () => {
    hapticsBridge.warning();
    await setCustomAccent(null);
    router.back();
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.background.primary }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScreenHeader
          title={t('settings.accentColor.title')}
          right={
            <ThemedButton
              size="sm"
              variant="ghost"
              label={t('common.reset')}
              accessibilityLabel={t('settingsUi.resetAccentColor')}
              disabled={!customAccent}
              onPress={handleReset}
            />
          }
        />

        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}>
          <ThemedText variant="bodySmall" tone="secondary" style={styles.subtitle}>
            {t('settings.accentColor.subtitle')}
          </ThemedText>

          <Section title={t('settings.accentColor.section.presets')}>
            <View style={styles.presetGrid}>
              {ACCENT_PRESETS.map((preset) => (
                <PresetSwatch
                  key={preset.hex}
                  preset={preset}
                  selected={pending === preset.hex.toUpperCase()}
                  onPress={() => handleSelect(preset.hex)}
                />
              ))}
            </View>
          </Section>

          <Section title={t('settings.accentColor.section.gradients')}>
            <View style={styles.gradientList}>
              {ACCENT_GRADIENTS.map((g) => (
                <GradientCard
                  key={g.id}
                  gradient={g}
                  selected={pending === g.colors[0].toUpperCase()}
                  onPress={() => handleSelect(g.colors[0])}
                />
              ))}
            </View>
          </Section>

          <Section title={t('settings.accentColor.section.recent')}>
            <View style={styles.recentRow}>
              {recentAccents.map((hex) => (
                <Pressable
                  key={hex}
                  onPress={() => handleSelect(hex)}
                  accessibilityRole="button"
                  accessibilityLabel={`Use recent color ${hex}`}
                  style={({ pressed }) => [
                    styles.recentDot,
                    {
                      backgroundColor: hex,
                      borderColor: pending === hex ? theme.text.primary : theme.glassBorder,
                      borderWidth: pending === hex ? 2 : 1,
                    },
                    pressed && { opacity: 0.7 },
                  ]}
                />
              ))}
              <Pressable
                onPress={() => router.push('/(setting)/custom-color')}
                accessibilityRole="button"
                accessibilityLabel={t('settingsUi.addCustomColor')}
                style={({ pressed }) => [
                  styles.addCustom,
                  {
                    backgroundColor: theme.background.tertiary,
                    borderColor: theme.glassBorder,
                  },
                  pressed && { opacity: 0.7 },
                ]}>
                <Ionicons name="add" size={18} color={theme.text.secondary} />
              </Pressable>
            </View>
          </Section>
        </ScrollView>

        <View
          style={[
            styles.applyBar,
            {
              paddingBottom: Math.max(insets.bottom, 12) + 8,
              backgroundColor: theme.background.primary,
            },
          ]}>
          <ThemedButton
            label={t('settings.accentColor.apply')}
            onPress={handleApply}
            disabled={!dirty}
            size="lg"
            fullWidth
            accent={pending}
            haptic="success"
          />
        </View>
      </SafeAreaView>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText variant="captionSmall" tone="accent" weight="700" style={styles.sectionHeader}>
        {title}
      </ThemedText>
      {children}
    </View>
  );
}

function PresetSwatch({
  preset,
  selected,
  onPress,
}: {
  preset: AccentPreset;
  selected: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Select ${preset.name}`}
      accessibilityState={{ selected }}
      style={({ pressed }) => [styles.swatchWrap, pressed && { opacity: 0.85 }]}>
      <View
        style={[
          styles.swatchCircle,
          {
            backgroundColor: preset.hex,
            borderColor: selected ? preset.hex : 'transparent',
          },
        ]}>
        {selected ? (
          <View
            style={[
              styles.checkBadge,
              { backgroundColor: preset.hex, borderColor: theme.background.primary },
            ]}>
            <Ionicons name="checkmark" size={12} color={readableTextOn(preset.hex)} />
          </View>
        ) : null}
      </View>
      <ThemedText
        variant="bodySmall"
        tone={selected ? 'primary' : 'secondary'}
        weight={selected ? '600' : '500'}>
        {preset.name}
      </ThemedText>
      <ThemedText variant="captionSmall" tone="tertiary">
        {preset.hex}
      </ThemedText>
    </Pressable>
  );
}

function GradientCard({
  gradient,
  selected,
  onPress,
}: {
  gradient: AccentGradient;
  selected: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Select ${gradient.name} gradient`}
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.gradientCard,
        {
          borderColor: selected ? theme.text.primary : theme.glassBorder,
          borderWidth: selected ? 2 : 1,
        },
        pressed && { opacity: 0.9 },
      ]}>
      <LinearGradient
        colors={gradient.colors}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.gradientFill}>
        <View style={styles.gradientText}>
          <ThemedText
            variant="titleMedium"
            weight="700"
            style={{ color: readableTextOn(gradient.colors[0]) }}>
            {gradient.name}
          </ThemedText>
          <ThemedText
            variant="captionSmall"
            style={{ color: readableTextOn(gradient.colors[0]), opacity: 0.85 }}>
            {gradient.subtitle}
          </ThemedText>
        </View>
        {selected ? (
          <Ionicons name="checkmark-circle" size={20} color={readableTextOn(gradient.colors[1])} />
        ) : (
          <Ionicons name="chevron-forward" size={18} color={readableTextOn(gradient.colors[1])} />
        )}
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingTop: 8,
    paddingHorizontal: 0,
    gap: 18,
  },
  root: { flex: 1 },
  safe: { flex: 1 },
  subtitle: {
    lineHeight: 18,
    paddingHorizontal: 24,
    paddingBottom: 4,
  },
  section: {
    paddingHorizontal: 24,
    gap: 12,
  },
  sectionHeader: {
    letterSpacing: 1.2,
  },
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 16,
    columnGap: 12,
  },
  swatchWrap: {
    width: '22%',
    alignItems: 'center',
    gap: 6,
  },
  swatchCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 22,
    height: 22,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  gradientList: { gap: 10 },
  gradientCard: {
    borderRadius: Radius.card,
    overflow: 'hidden',
  },
  gradientFill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 64,
  },
  gradientText: { gap: 2 },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  recentDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  addCustom: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyBar: {
    paddingHorizontal: 24,
    paddingTop: 12,
  },
});
