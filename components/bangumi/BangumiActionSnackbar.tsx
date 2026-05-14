// Bottom snackbar shown after quick-add / reminder gestures.
// Auto-dismisses after ~3.5s; tapping the action triggers Undo and dismisses
// immediately. Sits above the floating tab bar via a bottom offset.

import { memo, useEffect, useRef } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { Radius, Spacing, Typography } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { readableTextOn } from '../themed';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';

interface BangumiActionSnackbarProps {
  visible: boolean;
  message: string;
  /** Icon shown on the leading edge. */
  icon?: React.ComponentProps<typeof MaterialIcons>['name'];
  /** Label for the trailing action (e.g. "Undo"). Omit to hide. */
  actionLabel?: string;
  onAction?: () => void;
  onDismiss: () => void;
  /** Auto-dismiss delay in ms. Default 3500. */
  durationMs?: number;
  /** Distance from screen bottom in px. Default 96 to clear the floating tab bar. */
  bottomOffset?: number;
}

function BangumiActionSnackbarComponent({
  visible,
  message,
  icon = 'check-circle',
  actionLabel,
  onAction,
  onDismiss,
  durationMs = 3500,
  bottomOffset = 96,
}: BangumiActionSnackbarProps) {
  const { theme, effectiveMode } = useTheme();
  const blurTint =
    effectiveMode === 'light' ? 'systemThickMaterialLight' : 'systemThickMaterialDark';
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!visible) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      onDismiss();
    }, durationMs);
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [visible, durationMs, onDismiss]);

  if (!visible) return null;

  const actionColor = theme.accent;

  return (
    <Animated.View
      pointerEvents="box-none"
      entering={FadeInDown.duration(180)}
      exiting={FadeOutDown.duration(160)}
      style={[styles.wrapper, { bottom: bottomOffset }]}>
      <View
        style={[
          styles.container,
          {
            backgroundColor: theme.background.secondary,
            borderColor: theme.glassBorder,
          },
        ]}>
        {Platform.OS === 'ios' ? (
          <BlurView intensity={28} tint={blurTint} style={StyleSheet.absoluteFill} />
        ) : null}
        <MaterialIcons name={icon} size={20} color={actionColor} />
        <Text style={[styles.message, { color: theme.text.primary }]} numberOfLines={2}>
          {message}
        </Text>
        {actionLabel ? (
          <Pressable
            onPress={() => {
              hapticsBridge.selection();
              onAction?.();
              onDismiss();
            }}
            hitSlop={10}
            style={({ pressed }) => [
              styles.actionButton,
              {
                backgroundColor: actionColor,
                opacity: pressed ? 0.85 : 1,
              },
            ]}>
            <Text style={[styles.actionLabel, { color: readableTextOn(actionColor) }]}>
              {actionLabel}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: Spacing.md,
    right: Spacing.md,
    alignItems: 'center',
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    alignSelf: 'stretch',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.25,
        shadowRadius: 14,
      },
      android: { elevation: 6 },
    }),
  },
  message: {
    ...Typography.bodyMedium,
    flex: 1,
  },
  actionButton: {
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: 6,
    borderRadius: Radius.chip,
  },
  actionLabel: {
    ...Typography.captionSmall,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
});

export const BangumiActionSnackbar = memo(BangumiActionSnackbarComponent);
