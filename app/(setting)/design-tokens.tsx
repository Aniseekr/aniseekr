import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme, type ThemePalette } from '../../context/ThemeContext';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import { ThemedButton, ThemedText, readableTextOn } from '../../components/themed';
import { useT, type TranslationKey } from '../../libs/i18n';

interface Clipboard {
  setStringAsync(value: string): Promise<unknown>;
}
let clipboardModule: Clipboard | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  clipboardModule = require('expo-clipboard');
} catch {
  clipboardModule = null;
}

type Category = 'all' | 'accent' | 'surface' | 'text' | 'brand';

interface Token {
  name: string;
  variable: string;
  hex: string;
  category: Exclude<Category, 'all'>;
}

const TOKENS: Token[] = [
  // Accents
  { name: 'Orange', variable: 'accent-orange', hex: '#FF9900', category: 'accent' },
  { name: 'Red', variable: 'accent-red', hex: '#FF3B30', category: 'accent' },
  { name: 'Gold', variable: 'accent-gold', hex: '#FFD700', category: 'accent' },
  { name: 'Green', variable: 'accent-green', hex: '#32D74B', category: 'accent' },
  { name: 'Cyan', variable: 'accent-cyan', hex: '#00BCD4', category: 'accent' },
  { name: 'Blue', variable: 'accent-blue', hex: '#007AFF', category: 'accent' },
  { name: 'Purple', variable: 'accent-purple', hex: '#AF52DE', category: 'accent' },
  // Surface
  { name: 'Background', variable: 'bg-primary', hex: '#080808', category: 'surface' },
  { name: 'Card', variable: 'bg-card', hex: '#1A1A1A', category: 'surface' },
  { name: 'Elevated', variable: 'bg-elevated', hex: '#242424', category: 'surface' },
  { name: 'Border', variable: 'border-default', hex: '#2A2A2A', category: 'surface' },
  // Text
  { name: 'Primary', variable: 'text-primary', hex: '#FFFFFF', category: 'text' },
  { name: 'Secondary', variable: 'text-secondary', hex: '#8A8A8A', category: 'text' },
  { name: 'Muted', variable: 'text-muted', hex: '#525252', category: 'text' },
  // Brand
  { name: 'Solidarity Purple', variable: 'solidarity-purple', hex: '#5B2D8E', category: 'brand' },
  { name: 'Solidarity Pink', variable: 'solidarity-pink', hex: '#E8A0BF', category: 'brand' },
  { name: 'Solidarity Lavender', variable: 'solidarity-lavender', hex: '#F5EDF8', category: 'brand' },
];

const CATEGORIES: { id: Category; labelKey: TranslationKey }[] = [
  { id: 'all', labelKey: 'commonUi.all' },
  { id: 'accent', labelKey: 'settingsUi.accent' },
  { id: 'surface', labelKey: 'settingsUi.surface' },
  { id: 'text', labelKey: 'settingsUi.text' },
  { id: 'brand', labelKey: 'settingsUi.brand' },
];

export default function DesignTokensScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const accent = theme.accent;
  const accentFg = readableTextOn(accent);
  const [active, setActive] = useState<Category>('all');
  const [toast, setToast] = useState<string | null>(null);

  const visible = useMemo(
    () => (active === 'all' ? TOKENS : TOKENS.filter((t) => t.category === active)),
    [active]
  );

  const groups = useMemo(() => {
    const order: Token['category'][] = ['accent', 'surface', 'text', 'brand'];
    const seen = new Set<Token['category']>();
    const list: { category: Token['category']; tokens: Token[] }[] = [];
    order.forEach((c) => {
      const tokens = visible.filter((t) => t.category === c);
      if (tokens.length > 0 && !seen.has(c)) {
        seen.add(c);
        list.push({ category: c, tokens });
      }
    });
    return list;
  }, [visible]);

  const copy = async (label: string, text: string) => {
    hapticsBridge.tap();
    if (clipboardModule?.setStringAsync) {
      await clipboardModule.setStringAsync(text);
      setToast(`${label} copied`);
      setTimeout(() => setToast(null), 1400);
    } else {
      setToast('Clipboard unavailable');
      setTimeout(() => setToast(null), 1400);
    }
  };

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={styles.navBar}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            style={({ pressed }) => [styles.navBack, pressed && { opacity: 0.6 }]}>
            <Ionicons name="chevron-back" size={22} color={theme.text.primary} />
          </Pressable>
          <ThemedText variant="titleLarge" weight="600">
            {t('settingsUi.designTokens')}
          </ThemedText>
          <View style={{ width: 24 }} />
        </View>

        <ThemedText variant="bodySmall" tone="secondary" style={styles.subtitle}>
          {TOKENS.length} tokens · 2 themes (light / dark)
        </ThemedText>

        <View style={styles.chipsRow}>
          {CATEGORIES.map((c) => {
            const isActive = c.id === active;
            return (
              <Pressable
                key={c.id}
                onPress={() => {
                  hapticsBridge.selection();
                  setActive(c.id);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Filter ${t(c.labelKey)}`}
                accessibilityState={{ selected: isActive }}
                style={({ pressed }) => [
                  styles.chip,
                  isActive
                    ? { backgroundColor: accent, borderColor: accent }
                    : {
                        backgroundColor: theme.background.tertiary,
                        borderColor: theme.glassBorder,
                      },
                  pressed && { opacity: 0.8 },
                ]}>
                <ThemedText
                  variant="bodySmall"
                  weight="600"
                  style={{ color: isActive ? accentFg : theme.text.primary }}>
                  {t(c.labelKey)}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>

        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 80 }]}
          showsVerticalScrollIndicator={false}>
          {groups.map((g) => (
            <View key={g.category} style={{ gap: 10 }}>
              <ThemedText variant="captionSmall" tone="secondary" weight="600" style={styles.groupHeader}>
                {g.category.toUpperCase()}
              </ThemedText>
              <View style={styles.tokenList}>
                {g.tokens.map((t, idx) => (
                  <View key={t.variable}>
                    <Pressable
                      onLongPress={() => copy(t.variable, `$${t.variable}`)}
                      onPress={() => copy(t.hex, t.hex)}
                      accessibilityRole="button"
                      accessibilityLabel={`Copy ${t.name} ${t.hex}`}
                      style={({ pressed }) => [
                        styles.tokenRow,
                        pressed && { backgroundColor: 'rgba(255,255,255,0.03)' },
                      ]}>
                      <View
                        style={[
                          styles.tokenSwatch,
                          { backgroundColor: t.hex, borderColor: theme.glassBorder },
                        ]}
                      />
                      <View style={{ flex: 1 }}>
                        <ThemedText variant="bodySmall" weight="600">
                          {t.name}
                        </ThemedText>
                        <ThemedText variant="captionSmall" tone="secondary" style={{ marginTop: 2 }}>
                          ${t.variable}
                        </ThemedText>
                      </View>
                      <ThemedText variant="bodySmall" tone="secondary" weight="600">
                        {t.hex}
                      </ThemedText>
                      <Ionicons name="copy-outline" size={14} color={theme.text.tertiary} />
                    </Pressable>
                    {idx < g.tokens.length - 1 ? (
                      <View
                        style={[styles.separator, { backgroundColor: theme.glassBorder }]}
                      />
                    ) : null}
                  </View>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>

        <View
          style={[
            styles.footer,
            {
              paddingBottom: Math.max(insets.bottom, 12),
              backgroundColor: theme.background.primary,
              borderTopColor: theme.glassBorder,
            },
          ]}>
          <View style={styles.footerLeft}>
            <Ionicons name="document-text-outline" size={14} color={theme.text.secondary} />
            <ThemedText variant="bodySmall" tone="secondary" weight="500">
              tokens.ts
            </ThemedText>
          </View>
          <ThemedButton
            label={t('settingsUi.export')}
            size="sm"
            onPress={() =>
              copy('All tokens', TOKENS.map((t) => `$${t.variable}: ${t.hex}`).join('\n'))
            }
            icon={<Ionicons name="download-outline" size={14} color={accentFg} />}
          />
        </View>

        {toast ? (
          <View
            style={[
              styles.toast,
              {
                bottom: insets.bottom + 80,
                backgroundColor: theme.background.tertiary,
                borderColor: theme.glassBorder,
              },
            ]}>
            <ThemedText variant="bodySmall" weight="600">
              {toast}
            </ThemedText>
          </View>
        ) : null}
      </SafeAreaView>
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
    navBack: { minWidth: 24 },
    subtitle: {
      paddingHorizontal: 20,
      paddingBottom: 8,
    },
    chipsRow: {
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: 16,
      paddingBottom: 8,
      flexWrap: 'wrap',
    },
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      borderWidth: 1,
    },
    scroll: { padding: 16, gap: 16 },
    groupHeader: {
      letterSpacing: 1.2,
    },
    tokenList: {
      backgroundColor: theme.background.secondary,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.glassBorder,
      overflow: 'hidden',
    },
    tokenRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
      paddingHorizontal: 14,
    },
    tokenSwatch: {
      width: 32,
      height: 32,
      borderRadius: 999,
      borderWidth: 1,
    },
    separator: { height: 1 },
    footer: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 12,
      borderTopWidth: 1,
    },
    footerLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    toast: {
      position: 'absolute',
      alignSelf: 'center',
      borderWidth: 1,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 999,
    },
  });
}
