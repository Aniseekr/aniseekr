import { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Spacing } from '../../constants/DesignSystem';
import { useT } from '../../libs/i18n';
import { ThemedIconButton } from './ThemedIconButton';
import { ThemedText } from './ThemedText';

export interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  /** Defaults to `router.back()`. Pass `null` to hide the back button. */
  onBack?: (() => void) | null;
  right?: ReactNode;
}

const SIDE = 40;

/**
 * The one pushed-screen header: square ink-framed back button, centred title,
 * optional subtitle and right slot. Every stack screen draws this instead of
 * its own nav bar so the chrome reads the same from screen to screen.
 */
export function ScreenHeader({ title, subtitle, onBack, right }: ScreenHeaderProps) {
  const router = useRouter();
  const t = useT();
  const back = onBack === undefined ? () => router.back() : onBack;

  return (
    <View style={styles.header}>
      <View style={styles.side}>
        {back ? (
          <ThemedIconButton
            accessibilityLabel={t('common.back')}
            size={SIDE}
            icon={(c) => <MaterialIcons name="arrow-back" size={20} color={c} />}
            onPress={back}
          />
        ) : null}
      </View>
      <View style={styles.titles}>
        <ThemedText variant="titleLarge" weight="800" numberOfLines={1}>
          {title}
        </ThemedText>
        {subtitle ? (
          <ThemedText variant="bodySmall" tone="secondary" numberOfLines={1}>
            {subtitle}
          </ThemedText>
        ) : null}
      </View>
      <View style={[styles.side, styles.right]}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  side: {
    minWidth: SIDE,
  },
  right: {
    alignItems: 'flex-end',
  },
  titles: {
    flex: 1,
    alignItems: 'center',
  },
});
