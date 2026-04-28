import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Spacing, Typography } from '../../constants/DesignSystem';
import { useTheme, ThemeId, ThemePalette } from '../../context/ThemeContext';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import { SettingsScreenLayout } from '../../components/setting/SettingsScreenLayout';

export default function ThemeSettingsScreen() {
  const { theme, themeId, setTheme, themes } = useTheme();

  const handleSelect = async (id: ThemeId) => {
    if (id === themeId) return;
    hapticsBridge.success();
    await setTheme(id);
  };

  return (
    <SettingsScreenLayout
      title="Appearance"
      subtitle="Pick a palette that fits your vibe">
      <Text style={[styles.intro, { color: theme.text.secondary }]}>
        Themes change accent colors, gradients, and surface tints across the entire app.
      </Text>

      <View style={styles.grid}>
        {themes.map((palette) => (
          <ThemeCard
            key={palette.id}
            palette={palette}
            isSelected={palette.id === themeId}
            onPress={() => handleSelect(palette.id)}
          />
        ))}
      </View>
    </SettingsScreenLayout>
  );
}

function ThemeCard({
  palette,
  isSelected,
  onPress,
}: {
  palette: ThemePalette;
  isSelected: boolean;
  onPress: () => void;
}) {
  const { theme: current } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          borderColor: isSelected ? palette.accent : current.glassBorder,
          borderWidth: isSelected ? 2 : 1,
          opacity: pressed ? 0.85 : 1,
        },
      ]}>
      <LinearGradient
        colors={palette.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.cardSurface}>
        <View style={styles.cardHeader}>
          <View style={[styles.swatch, { backgroundColor: palette.accent }]} />
          <View style={[styles.swatch, { backgroundColor: palette.accentLight }]} />
          <View style={[styles.swatch, { backgroundColor: palette.secondary }]} />
        </View>
        <View style={{ flex: 1 }} />
        <View style={styles.cardFooter}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardName, { color: palette.text.primary }]}>
              {palette.name}
            </Text>
            {palette.isPremium ? (
              <View
                style={[
                  styles.badge,
                  { backgroundColor: palette.accent + '40' },
                ]}>
                <Text style={[styles.badgeText, { color: palette.accent }]}>
                  Premium
                </Text>
              </View>
            ) : null}
          </View>
          {isSelected ? (
            <MaterialIcons name="check-circle" size={22} color={palette.accent} />
          ) : null}
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  intro: {
    ...Typography.bodyMedium,
    paddingHorizontal: 4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  card: {
    width: '48%',
    height: 170,
    borderRadius: 18,
    overflow: 'hidden',
  },
  cardSurface: {
    flex: 1,
    padding: Spacing.sm + 2,
  },
  cardHeader: {
    flexDirection: 'row',
    gap: 6,
  },
  swatch: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  cardName: {
    ...Typography.titleMedium,
    fontWeight: '700',
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginTop: 4,
  },
  badgeText: {
    ...Typography.captionSmall,
    fontWeight: '700',
  },
});
