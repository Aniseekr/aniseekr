/* eslint-disable react-hooks/set-state-in-effect -- Existing open-reset effect; Phase 3 only replaces the sheet shell. */
import { memo, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Spacing, Typography } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import { useT } from '../../libs/i18n';
import { ThemedBottomSheet } from '../themed';

interface YearPickerSheetProps {
  visible: boolean;
  selectedYear: number;
  minYear?: number;
  maxYear?: number;
  onClose: () => void;
  onSelect: (year: number) => void;
  onPrevYear?: () => void;
  onNextYear?: () => void;
}

function YearPickerSheetComponent({
  visible,
  selectedYear,
  minYear = 1990,
  maxYear = new Date().getFullYear() + 2,
  onClose,
  onSelect,
  onPrevYear,
  onNextYear,
}: YearPickerSheetProps) {
  const { theme } = useTheme();
  const t = useT();
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (visible) setSearch('');
  }, [visible]);

  const filteredYears = useMemo(() => {
    const all: number[] = [];
    for (let y = maxYear; y >= minYear; y--) all.push(y);
    if (!search.trim()) return all;
    return all.filter((y) => y.toString().includes(search.trim()));
  }, [search, minYear, maxYear]);

  const handleSelect = (y: number) => {
    hapticsBridge.success();
    onSelect(y);
    onClose();
  };

  return (
    <ThemedBottomSheet visible={visible} onClose={onClose}>
      <KeyboardAvoidingView behavior="padding">
        <SafeAreaView edges={['bottom']}>
          <View style={styles.headerRow}>
            <Text style={[styles.title, { color: theme.text.primary }]}>
              {t('bangumiTab.pickAYear')}
            </Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <MaterialIcons name="close" size={22} color={theme.text.secondary} />
            </Pressable>
          </View>

          <View
            style={[
              styles.searchBar,
              {
                backgroundColor: theme.background.tertiary,
                borderColor: theme.glassBorder,
              },
            ]}>
            <MaterialIcons name="search" size={18} color={theme.text.tertiary} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder={t('bangumiTab.filterByYear')}
              placeholderTextColor={theme.text.tertiary}
              keyboardType="number-pad"
              style={[styles.searchInput, { color: theme.text.primary }]}
            />
          </View>

          <ScrollView style={{ maxHeight: 280 }} showsVerticalScrollIndicator={false}>
            {filteredYears.map((y) => {
              const isSelected = y === selectedYear;
              return (
                <Pressable
                  key={y}
                  onPress={() => handleSelect(y)}
                  style={({ pressed }) => [
                    styles.yearRow,
                    {
                      backgroundColor: isSelected ? theme.accent + '20' : 'transparent',
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}>
                  <Text
                    style={[
                      styles.yearText,
                      {
                        color: isSelected ? theme.accent : theme.text.primary,
                        fontWeight: isSelected ? '700' : '500',
                      },
                    ]}>
                    {y}
                  </Text>
                  {isSelected ? (
                    <MaterialIcons name="check-circle" size={20} color={theme.accent} />
                  ) : null}
                </Pressable>
              );
            })}
            {filteredYears.length === 0 ? (
              <Text style={[styles.empty, { color: theme.text.tertiary }]}>
                {t('bangumiTab.noMatches')}
              </Text>
            ) : null}
          </ScrollView>

          {onPrevYear || onNextYear ? (
            <View style={styles.quickRow}>
              {onPrevYear ? (
                <Pressable
                  onPress={() => {
                    hapticsBridge.selection();
                    onPrevYear();
                    onClose();
                  }}
                  style={({ pressed }) => [
                    styles.quickButton,
                    {
                      borderColor: theme.glassBorder,
                      backgroundColor: theme.background.tertiary,
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}>
                  <MaterialIcons name="arrow-back" size={18} color={theme.text.primary} />
                  <Text style={[styles.quickLabel, { color: theme.text.primary }]}>
                    {t('bangumiTab.previousYear')}
                  </Text>
                </Pressable>
              ) : null}
              {onNextYear ? (
                <Pressable
                  onPress={() => {
                    hapticsBridge.selection();
                    onNextYear();
                    onClose();
                  }}
                  style={({ pressed }) => [
                    styles.quickButton,
                    {
                      borderColor: theme.glassBorder,
                      backgroundColor: theme.background.tertiary,
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}>
                  <Text style={[styles.quickLabel, { color: theme.text.primary }]}>
                    {t('bangumiTab.nextYear')}
                  </Text>
                  <MaterialIcons name="arrow-forward" size={18} color={theme.text.primary} />
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </SafeAreaView>
      </KeyboardAvoidingView>
    </ThemedBottomSheet>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  title: {
    ...Typography.headlineSmall,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    ...Typography.bodyMedium,
    paddingVertical: 0,
  },
  yearRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderRadius: 10,
  },
  yearText: {
    ...Typography.titleMedium,
  },
  empty: {
    ...Typography.bodyMedium,
    textAlign: 'center',
    paddingVertical: Spacing.lg,
  },
  quickRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  quickButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: Spacing.sm,
    borderRadius: 12,
    borderWidth: 1,
  },
  quickLabel: {
    ...Typography.titleSmall,
    fontWeight: '600',
  },
});

export const YearPickerSheet = memo(YearPickerSheetComponent);
