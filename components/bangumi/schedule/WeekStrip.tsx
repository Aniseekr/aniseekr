import { ScrollView, StyleSheet, View } from 'react-native';
import { ThemedIconButton, ThemedText, readableTextOn } from '../../themed';
import { useTheme } from '../../../context/ThemeContext';
import { useT } from '../../../libs/i18n';
import { airingWeekdayKey } from '../../../libs/utils/airing';
import { FontFamily, Spacing } from '../../../constants/DesignSystem';

export function WeekStrip({
  selected,
  onSelect,
}: {
  selected: number;
  onSelect: (day: number) => void;
}) {
  const { theme } = useTheme();
  const t = useT();
  const monday = new Date();
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.strip}>
      {Array.from({ length: 7 }, (_, index) => {
        const date = new Date(monday);
        date.setDate(monday.getDate() + index);
        const day = date.getDay();
        const active = selected === day;
        const color = active ? readableTextOn(theme.accent) : theme.text.primary;
        const label = t(airingWeekdayKey(date.getTime() / 1000));
        return (
          <ThemedIconButton
            key={day}
            size={44}
            variant={active ? 'solid' : 'ghost'}
            haptic="selection"
            accessibilityLabel={`${label} ${date.getMonth() + 1}/${date.getDate()}`}
            onPress={() => onSelect(day)}
            icon={
              <View style={styles.cell}>
                <ThemedText variant="captionSmall" style={{ color }}>
                  {label}
                </ThemedText>
                <ThemedText
                  variant="titleLarge"
                  weight="700"
                  style={{ color, fontFamily: FontFamily.display }}>
                  {date.getDate()}
                </ThemedText>
              </View>
            }
          />
        );
      })}
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  strip: { flexGrow: 1, justifyContent: 'space-between', gap: Spacing.xxs },
  cell: { alignItems: 'center' },
});
