import { Pressable, StyleSheet, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useTheme } from '../../../context/ThemeContext';
import { Radius, Spacing } from '../../../constants/DesignSystem';
import { Halftone, ThemedSurface, ThemedText } from '../../themed';
import { hapticsBridge } from '../../../modules/haptics/hapticsBridge';

export interface ExhibitCardProps {
  title: string;
  subtitle: string;
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  /** Full-width lead card; the rest sit two to a row. */
  featured?: boolean;
  onPress: () => void;
}

export function ExhibitCard({ title, subtitle, icon, featured, onPress }: ExhibitCardProps) {
  const { theme } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={subtitle}
      onPress={() => {
        hapticsBridge.tap();
        onPress();
      }}
      style={({ pressed }) => [
        featured ? styles.featuredWrap : styles.wrap,
        pressed && styles.pressed,
      ]}>
      <ThemedSurface style={[styles.card, featured && styles.featured]}>
        {featured ? <Halftone color={theme.accent} /> : null}
        <View style={[styles.iconWrap, { backgroundColor: theme.background.tertiary }]}>
          <MaterialIcons name={icon} size={22} color={theme.accent} />
        </View>
        <View style={styles.text}>
          <ThemedText variant={featured ? 'titleLarge' : 'titleMedium'} weight="700">
            {title}
          </ThemedText>
          <ThemedText variant="bodySmall" tone="secondary" numberOfLines={2}>
            {subtitle}
          </ThemedText>
        </View>
        {featured ? (
          <MaterialIcons name="chevron-right" size={22} color={theme.text.tertiary} />
        ) : null}
      </ThemedSurface>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '48.5%' },
  featuredWrap: { width: '100%' },
  pressed: { opacity: 0.85 },
  card: {
    flex: 1,
    padding: Spacing.md,
    gap: Spacing.sm,
    minHeight: 124,
  },
  featured: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 88,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    gap: Spacing.xxs,
  },
});
