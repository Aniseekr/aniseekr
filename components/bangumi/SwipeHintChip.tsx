import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Radius, Spacing, Typography } from '../../constants/DesignSystem';
import { useTheme, type ThemePalette } from '../../context/ThemeContext';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import { useT } from '../../libs/i18n';

interface SwipeHintChipProps {
  onDismiss: () => void;
}

export function SwipeHintChip({ onDismiss }: SwipeHintChipProps) {
  const { theme } = useTheme();
  const t = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const handleDismiss = () => {
    hapticsBridge.tap();
    onDismiss();
  };

  return (
    <Animated.View
      entering={FadeIn.duration(220)}
      exiting={FadeOut.duration(160)}
      style={styles.wrapper}
    >
      <View style={styles.iconBubble}>
        <MaterialIcons name="swap-horiz" size={14} color={theme.accent} />
      </View>
      <Text style={styles.label} numberOfLines={1}>
        <Text style={styles.labelEmphasis}>{`← ${t('bangumiTab.remind')}`}</Text>
        <Text style={styles.labelDivider}>  ·  </Text>
        <Text style={styles.labelEmphasis}>{`${t('commonUi.plan')} →`}</Text>
      </Text>
      <Pressable
        onPress={handleDismiss}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={t('bangumiTab.dismissSwipeHint')}
        style={({ pressed }) => [styles.dismissBtn, pressed && { opacity: 0.6 }]}
      >
        <MaterialIcons name="close" size={14} color={theme.text.tertiary} />
      </Pressable>
    </Animated.View>
  );
}

const makeStyles = (theme: ThemePalette) =>
  StyleSheet.create({
    wrapper: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      marginHorizontal: Spacing.md,
      marginBottom: Spacing.sm,
      paddingHorizontal: Spacing.sm + 2,
      paddingVertical: Spacing.xs + 2,
      borderRadius: Radius.full,
      backgroundColor: theme.background.secondary,
      borderWidth: 1,
      borderColor: theme.glassBorder,
    },
    iconBubble: {
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: `${theme.accent}22`,
    },
    label: {
      flex: 1,
      ...Typography.captionSmall,
      color: theme.text.secondary,
      letterSpacing: 0.4,
    },
    labelEmphasis: {
      ...Typography.captionSmall,
      color: theme.text.primary,
      fontWeight: '600',
    },
    labelDivider: {
      color: theme.text.tertiary,
    },
    dismissBtn: {
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.background.tertiary,
    },
  });
