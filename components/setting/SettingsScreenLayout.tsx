import { ReactNode } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Colors, Ink, Radius, Spacing, Typography } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import { CapsText } from '../themed/CapsText';
import { withAlpha } from '../themed/contrast';
import { ScreenHeader } from '../themed/ScreenHeader';

interface SettingsScreenLayoutProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  rightSlot?: ReactNode;
  scrollable?: boolean;
  contentStyle?: ViewStyle;
  refreshing?: boolean;
  onRefresh?: () => void;
}

export function SettingsScreenLayout({
  title,
  subtitle,
  children,
  rightSlot,
  scrollable = true,
  contentStyle,
  refreshing,
  onRefresh,
}: SettingsScreenLayoutProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();

  const Body = scrollable ? ScrollView : View;
  const bodyProps = scrollable
    ? {
        contentContainerStyle: [
          styles.content,
          { paddingBottom: insets.bottom + 120 },
          contentStyle,
        ],
        showsVerticalScrollIndicator: false,
        refreshControl: onRefresh ? (
          <RefreshControl
            refreshing={!!refreshing}
            onRefresh={onRefresh}
            tintColor={theme.text.primary}
          />
        ) : undefined,
      }
    : { style: [styles.content, contentStyle] };

  return (
    <View style={[styles.root, { backgroundColor: theme.background.primary }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <LinearGradient colors={theme.gradient} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScreenHeader
          title={title}
          subtitle={subtitle}
          right={rightSlot}
          onBack={() => {
            hapticsBridge.tap();
            router.back();
          }}
        />
        <Body {...(bodyProps as any)}>{children}</Body>
      </SafeAreaView>
    </View>
  );
}

interface SectionProps {
  title?: string;
  children: ReactNode;
  style?: ViewStyle;
}
export function SettingsSection({ title, children, style }: SectionProps) {
  const { theme } = useTheme();
  return (
    <View style={[styles.section, style]}>
      {title ? (
        <View style={styles.sectionTitleRow}>
          <View style={[styles.sectionMark, { backgroundColor: theme.accent }]} />
          <CapsText style={[styles.sectionTitle, { color: theme.text.secondary }]}>
            {title}
          </CapsText>
        </View>
      ) : null}
      <View
        style={[
          styles.sectionCard,
          {
            backgroundColor: theme.background.secondary,
            borderColor: withAlpha(theme.text.primary, 0.22),
          },
        ]}>
        {children}
      </View>
    </View>
  );
}

interface SettingsRowProps {
  icon?: React.ComponentProps<typeof MaterialIcons>['name'];
  label: string;
  value?: string;
  description?: string;
  onPress?: () => void;
  rightSlot?: ReactNode;
  destructive?: boolean;
}
export function SettingsRow({
  icon,
  label,
  value,
  description,
  onPress,
  rightSlot,
  destructive,
}: SettingsRowProps) {
  const { theme } = useTheme();
  const labelColor = destructive ? Colors.error : theme.text.primary;

  return (
    <Pressable
      onPress={() => {
        if (onPress) {
          hapticsBridge.selection();
          onPress();
        }
      }}
      style={({ pressed }) => [styles.row, { opacity: pressed && onPress ? 0.7 : 1 }]}>
      {icon ? (
        <View style={[styles.rowIcon, { backgroundColor: theme.background.tertiary }]}>
          <MaterialIcons name={icon} size={18} color={destructive ? Colors.error : theme.accent} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, { color: labelColor }]}>{label}</Text>
        {description ? (
          <Text style={[styles.rowDescription, { color: theme.text.secondary }]}>
            {description}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text style={[styles.rowValue, { color: theme.text.secondary }]}>{value}</Text>
      ) : null}
      {rightSlot ??
        (onPress ? (
          <MaterialIcons name="chevron-right" size={20} color={theme.text.tertiary} />
        ) : null)}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  content: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    gap: Spacing.md,
  },
  section: {
    gap: Spacing.xs,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  // The web's chapter tag, shrunk to a section marker.
  sectionMark: {
    width: 8,
    height: 8,
    borderRadius: 1,
  },
  sectionTitle: {
    ...Typography.captionSmall,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sectionCard: {
    borderRadius: Radius.card,
    borderWidth: Ink.hairline,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: Spacing.sm + 2,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: {
    ...Typography.titleMedium,
  },
  rowDescription: {
    ...Typography.bodySmall,
    marginTop: 2,
  },
  rowValue: {
    ...Typography.bodyMedium,
  },
});
