import { memo, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Radius, Size, Spacing, Typography } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { useT } from '../../libs/i18n';
import type { Season } from '../../libs/utils/season-utils';
import {
  ThemedBottomSheet,
  ThemedButton,
  ThemedIconButton,
  ThemedSurface,
  ThemedText,
} from '../themed';

interface YearPickerSheetProps {
  visible: boolean;
  selectedYear: number;
  selectedSeason?: Season;
  minYear?: number;
  maxYear?: number;
  onClose: () => void;
  onSelect: (year: number) => void;
  onSeasonSelect?: (season: Season) => void;
  onPrevYear?: () => void;
  onNextYear?: () => void;
}
const SEASONS = {
  WINTER: 'rate.winter',
  SPRING: 'rate.spring',
  SUMMER: 'rate.summer',
  FALL: 'rate.fall',
} as const;
export const YearPickerSheet = memo(function YearPickerSheet({
  visible,
  selectedYear,
  selectedSeason,
  minYear = 1990,
  maxYear = new Date().getFullYear() + 2,
  onClose,
  onSelect,
  onSeasonSelect,
  onPrevYear,
  onNextYear,
}: YearPickerSheetProps) {
  const { theme } = useTheme();
  const t = useT();
  const [search, setSearch] = useState('');
  const years = useMemo(
    () =>
      Array.from({ length: maxYear - minYear + 1 }, (_, index) => maxYear - index).filter((year) =>
        year.toString().includes(search.trim())
      ),
    [maxYear, minYear, search]
  );
  return (
    <ThemedBottomSheet visible={visible} onClose={onClose}>
      <KeyboardAvoidingView behavior="padding">
        <SafeAreaView edges={['bottom']} style={styles.content}>
          <View style={styles.row}>
            <ThemedText variant="headlineSmall" style={styles.grow}>
              {t(selectedSeason ? 'tabs.schedule.pickSeason' : 'bangumiTab.pickAYear')}
            </ThemedText>
            <ThemedIconButton
              variant="ghost"
              accessibilityLabel={t('common.close')}
              onPress={onClose}
              icon={(color) => <MaterialIcons name="close" size={22} color={color} />}
            />
          </View>
          {selectedSeason && onSeasonSelect ? (
            <ThemedSurface radius={Radius.lg} style={styles.seasons}>
              {(Object.keys(SEASONS) as Season[]).map((season) => (
                <View key={season} style={styles.grow}>
                  <ThemedButton
                    size="sm"
                    fullWidth
                    shape="rounded"
                    label={t(SEASONS[season])}
                    textStyle={styles.seasonLabel}
                    haptic="selection"
                    variant={selectedSeason === season ? 'primary' : 'ghost'}
                    onPress={() => onSeasonSelect(season)}
                  />
                </View>
              ))}
            </ThemedSurface>
          ) : null}
          <TextInput
            value={search}
            onChangeText={setSearch}
            keyboardType="number-pad"
            placeholder={t('bangumiTab.filterByYear')}
            placeholderTextColor={theme.text.tertiary}
            accessibilityLabel={t('bangumiTab.filterByYear')}
            style={[
              styles.search,
              { color: theme.text.primary, backgroundColor: theme.background.tertiary },
            ]}
          />
          <ScrollView style={styles.years} showsVerticalScrollIndicator={false}>
            {years.map((year) => (
              <ThemedButton
                key={year}
                fullWidth
                shape="rounded"
                label={String(year)}
                variant={year === selectedYear ? 'secondary' : 'ghost'}
                onPress={() => {
                  onSelect(year);
                  onClose();
                }}
              />
            ))}
            {!years.length ? (
              <ThemedText tone="secondary">{t('bangumiTab.noMatches')}</ThemedText>
            ) : null}
          </ScrollView>
          <View style={styles.row}>
            {onPrevYear ? (
              <ThemedButton
                style={styles.grow}
                variant="secondary"
                label={t('bangumiTab.previousYear')}
                onPress={() => {
                  onPrevYear();
                  onClose();
                }}
              />
            ) : null}
            {onNextYear ? (
              <ThemedButton
                style={styles.grow}
                variant="secondary"
                label={t('bangumiTab.nextYear')}
                onPress={() => {
                  onNextYear();
                  onClose();
                }}
              />
            ) : null}
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </ThemedBottomSheet>
  );
});
const styles = StyleSheet.create({
  content: { gap: Spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  seasons: { flexDirection: 'row', padding: 3 },
  // Compact button padding keeps all four labels visible; the line box keeps taps at 44pt.
  seasonLabel: { ...Typography.bodySmall, lineHeight: Size.minTouchTarget },
  grow: { flex: 1 },
  search: {
    ...Typography.bodyMedium,
    minHeight: 44,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.md,
  },
  years: { maxHeight: 280 },
});
