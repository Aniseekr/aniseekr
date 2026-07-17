import { memo, useCallback } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { Spacing, Typography } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import { useT } from '../../libs/i18n';
import { BrowseSourceChip } from '../common/BrowseSourceChip';
import { ON_DARK, ThemedBottomSheet, readableTextOn } from '../themed';
import type {
  SwipeContentMode,
  SwipePrefs,
  SwipeRatingButtons,
} from '../../libs/services/user-prefs';

// Re-export aliases for any legacy importers (kept stable across the swipe-prefs migration).
export type ImageContentMode = SwipeContentMode;
export type RatingButtonsMode = SwipeRatingButtons;
export type RatingPreferences = SwipePrefs;

interface ImageDisplaySettingsSheetProps {
  visible: boolean;
  preferences: SwipePrefs;
  onClose: () => void;
  onChange: (next: SwipePrefs) => void;
  restartGenreName?: string;
  onRestartGenre?: () => void;
}

function ImageDisplaySettingsSheetComponent({
  visible,
  preferences,
  onClose,
  onChange,
  restartGenreName,
  onRestartGenre,
}: ImageDisplaySettingsSheetProps) {
  const { theme } = useTheme();
  const t = useT();
  const activeFg = readableTextOn(theme.accent);

  const update = useCallback(
    <K extends keyof SwipePrefs>(key: K, value: SwipePrefs[K]) => {
      hapticsBridge.selection();
      onChange({ ...preferences, [key]: value });
    },
    [preferences, onChange]
  );

  const handleRestartGenre = useCallback(() => {
    if (!onRestartGenre) return;
    hapticsBridge.warning();
    onClose();
    setTimeout(onRestartGenre, 0);
  }, [onClose, onRestartGenre]);

  return (
    <ThemedBottomSheet visible={visible} onClose={onClose}>
      <SafeAreaView edges={['bottom']}>
        <View style={styles.headerRow}>
          <Text style={[styles.title, { color: theme.text.primary }]}>
            {t('rate.displaySettings')}
          </Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <MaterialIcons name="close" size={22} color={theme.text.secondary} />
          </Pressable>
        </View>

        <Text style={[styles.sectionLabel, { color: theme.text.secondary }]}>
          {t('commonUi.dataSource')}
        </Text>
        <View style={styles.sourceRow}>
          <BrowseSourceChip
            onPress={() => {
              hapticsBridge.tap();
              onClose();
              router.push('/(setting)/data-source');
            }}
          />
        </View>

        <Text style={[styles.sectionLabel, { color: theme.text.secondary }]}>
          {t('rate.imageFit')}
        </Text>
        <View style={styles.segmented}>
          {(['fill', 'fit'] as SwipeContentMode[]).map((mode) => {
            const active = preferences.contentMode === mode;
            return (
              <Pressable
                key={mode}
                onPress={() => update('contentMode', mode)}
                style={({ pressed }) => [
                  styles.segmentItem,
                  {
                    backgroundColor: active ? theme.accent : theme.background.tertiary,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}>
                <MaterialIcons
                  name={mode === 'fill' ? 'crop-square' : 'crop-original'}
                  size={18}
                  color={active ? activeFg : theme.text.primary}
                />
                <Text
                  style={[styles.segmentLabel, { color: active ? activeFg : theme.text.primary }]}>
                  {mode === 'fill' ? 'Fill' : 'Fit'}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.sectionLabel, { color: theme.text.secondary }]}>
          {t('rate.ratingButtonsLikeMode')}
        </Text>
        <View style={styles.segmented}>
          {(['three', 'five'] as SwipeRatingButtons[]).map((mode) => {
            const active = preferences.ratingButtons === mode;
            return (
              <Pressable
                key={mode}
                onPress={() => update('ratingButtons', mode)}
                style={({ pressed }) => [
                  styles.segmentItem,
                  {
                    backgroundColor: active ? theme.accent : theme.background.tertiary,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}>
                <Text
                  style={[styles.segmentLabel, { color: active ? activeFg : theme.text.primary }]}>
                  {mode === 'three' ? '3 buttons' : '5 buttons'}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <ToggleRow
          icon="auto-awesome"
          label={t('rate.aiInsights')}
          description={t('rate.showAiGeneratedRecommendationsOn')}
          value={preferences.showAIInsights}
          onChange={(v) => update('showAIInsights', v)}
        />
        <ToggleRow
          icon="bookmark"
          label={t('rate.trackingShortcut')}
          description={t('rate.addAnimeToListsDirectly')}
          value={preferences.trackingShortcut}
          onChange={(v) => update('trackingShortcut', v)}
        />
        <ToggleRow
          icon="translate"
          label={t('rate.originalTitles')}
          description={t('rate.showRomajiOrJapaneseTitles')}
          value={preferences.showOriginalTitle}
          onChange={(v) => update('showOriginalTitle', v)}
        />

        {onRestartGenre ? (
          <>
            <Text style={[styles.sectionLabel, { color: theme.text.secondary }]}>
              {t('rate.deck')}
            </Text>
            <ActionRow
              icon="refresh"
              label={t('rate.restartThisGenre')}
              description={
                restartGenreName
                  ? `Start ${restartGenreName} from the first card again`
                  : 'Start this genre from the first card again'
              }
              onPress={handleRestartGenre}
              destructive
            />
          </>
        ) : null}
      </SafeAreaView>
    </ThemedBottomSheet>
  );
}

function ActionRow({
  icon,
  label,
  description,
  onPress,
  destructive = false,
}: {
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  label: string;
  description: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  const { theme } = useTheme();
  const tint = destructive ? theme.status.error : theme.accent;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.actionRow,
        {
          borderColor: theme.glassBorder,
          backgroundColor: theme.background.tertiary,
          opacity: pressed ? 0.82 : 1,
        },
      ]}>
      <MaterialIcons name={icon} size={22} color={tint} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.actionLabel, { color: tint }]}>{label}</Text>
        <Text style={[styles.toggleDescription, { color: theme.text.secondary }]}>
          {description}
        </Text>
      </View>
      <MaterialIcons name="chevron-right" size={22} color={theme.text.tertiary} />
    </Pressable>
  );
}

function ToggleRow({
  icon,
  label,
  description,
  value,
  onChange,
}: {
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  label: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const { theme } = useTheme();
  return (
    <View
      style={[
        styles.toggleRow,
        { borderColor: theme.glassBorder, backgroundColor: theme.background.tertiary },
      ]}>
      <MaterialIcons name={icon} size={22} color={theme.accent} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.toggleLabel, { color: theme.text.primary }]}>{label}</Text>
        <Text style={[styles.toggleDescription, { color: theme.text.secondary }]}>
          {description}
        </Text>
      </View>
      <Switch
        value={value}
        onValueChange={(v) => {
          hapticsBridge.selection();
          onChange(v);
        }}
        trackColor={{ false: theme.background.primary, true: theme.accent }}
        thumbColor={value ? ON_DARK : theme.text.tertiary}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  title: {
    ...Typography.headlineSmall,
  },
  sectionLabel: {
    ...Typography.captionSmall,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  segmented: {
    flexDirection: 'row',
    gap: 6,
  },
  segmentItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: Spacing.sm,
    borderRadius: 12,
  },
  segmentLabel: {
    ...Typography.titleSmall,
    fontWeight: '600',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.sm,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: Spacing.sm,
  },
  toggleLabel: {
    ...Typography.titleMedium,
  },
  actionRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.sm,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: Spacing.sm,
  },
  actionLabel: {
    ...Typography.titleMedium,
    fontWeight: '700',
  },
  toggleDescription: {
    ...Typography.bodySmall,
    marginTop: 2,
  },
});

export const ImageDisplaySettingsSheet = memo(ImageDisplaySettingsSheetComponent);
