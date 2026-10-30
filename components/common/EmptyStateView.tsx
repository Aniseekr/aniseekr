import { memo, ReactNode } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Radius, Spacing } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { ThemedButton, ThemedText } from '../themed';
import { SeekrPose, type SeekrPoseName } from '../brand/SeekrPose';
import { ScreentoneDisc } from '../brand/MangaFx';

type IconName = React.ComponentProps<typeof MaterialIcons>['name'];

interface EmptyStateViewProps {
  /** Small badge on Seekr that hints what is empty (search, wifi-off, …). */
  icon?: IconName;
  pose?: SeekrPoseName;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  style?: ViewStyle;
  iconNode?: ReactNode;
}

const POSE_H = 128;
const TONE = 150;
const BADGE = 36;

function EmptyStateViewComponent({
  icon = 'inbox',
  pose = 'read',
  title,
  description,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  style,
  iconNode,
}: EmptyStateViewProps) {
  const { theme } = useTheme();

  return (
    <View style={[styles.container, style]}>
      <View style={styles.hero}>
        <ScreentoneDisc size={TONE} color={theme.accent} opacity={0.4} style={styles.tone} />
        <SeekrPose pose={pose} height={POSE_H} />
        <View
          pointerEvents="none"
          style={[
            styles.badge,
            { backgroundColor: theme.background.secondary, borderColor: theme.glassBorder },
          ]}>
          {iconNode ?? <MaterialIcons name={icon} size={18} color={theme.accent} />}
        </View>
      </View>
      <ThemedText variant="headlineSmall" align="center">
        {title}
      </ThemedText>
      {description ? (
        <ThemedText variant="bodyMedium" tone="secondary" align="center" style={styles.description}>
          {description}
        </ThemedText>
      ) : null}
      {actionLabel && onAction ? (
        <View style={styles.action}>
          <ThemedButton label={actionLabel} onPress={onAction} haptic="tap" />
        </View>
      ) : null}
      {secondaryActionLabel && onSecondaryAction ? (
        <ThemedButton
          variant="secondary"
          size="sm"
          label={secondaryActionLabel}
          onPress={onSecondaryAction}
          haptic="selection"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xxl,
    gap: Spacing.sm,
  },
  hero: {
    width: TONE,
    height: TONE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xs,
  },
  tone: {
    position: 'absolute',
  },
  badge: {
    position: 'absolute',
    right: Spacing.xs,
    bottom: Spacing.xs,
    width: BADGE,
    height: BADGE,
    borderRadius: Radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  description: {
    maxWidth: 320,
  },
  action: {
    marginTop: Spacing.md,
    minWidth: 160,
  },
});

export const EmptyStateView = memo(EmptyStateViewComponent);
