import { Children, Fragment, ReactNode, isValidElement } from 'react';
import {
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../context/ThemeContext';
import { Spacing, Typography } from '../../constants/DesignSystem';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import { useT } from '../../libs/i18n';

/**
 * Static layout values that don't depend on theme.
 * Color tokens come from `useTheme()` inside each component below.
 */
export const SettingsLayout = {
  rowPaddingV: 14,
  rowPaddingH: 14,
  rowGap: 12,
  cardRadius: 16,
  iconSize: 20,
  chevronSize: 18,
  labelFontSize: 14,
  descriptionFontSize: 12,
} as const;

const DESTRUCTIVE = '#FF453A';

type IoniconName = keyof typeof Ionicons.glyphMap;

export function SettingsHeader({
  title,
  subtitle,
  onBack,
  right,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: ReactNode;
}) {
  const { theme } = useTheme();
  const t = useT();
  return (
    <View style={styles.header}>
      {onBack ? (
        <Pressable
          onPress={onBack}
          style={[
            styles.backButton,
            { backgroundColor: theme.background.secondary, borderColor: theme.glassBorder },
          ]}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}>
          <Ionicons name="arrow-back" size={22} color={theme.text.primary} />
        </Pressable>
      ) : null}
      <View style={styles.headerTextWrap}>
        <Text style={[styles.headerTitle, { color: theme.text.primary }]}>{title}</Text>
        {subtitle ? (
          <Text style={[styles.headerSubtitle, { color: theme.text.secondary }]}>{subtitle}</Text>
        ) : null}
      </View>
      {right ? <View>{right}</View> : null}
    </View>
  );
}

export function SettingsSection({
  title,
  children,
  style,
}: {
  title?: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useTheme();
  const items = Children.toArray(children).filter(
    (child) =>
      isValidElement(child) &&
      child.props &&
      (child.props as { hidden?: boolean }).hidden !== true
  );
  return (
    <View style={style}>
      {title ? (
        <Text style={[styles.sectionTitle, { color: theme.text.secondary }]}>{title}</Text>
      ) : null}
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.background.secondary,
            borderColor: theme.glassBorder,
          },
        ]}>
        {items.map((child, idx) => (
          <Fragment key={idx}>
            {child}
            {idx < items.length - 1 ? (
              <View style={[styles.separator, { backgroundColor: theme.glassBorder }]} />
            ) : null}
          </Fragment>
        ))}
      </View>
    </View>
  );
}

function RowShell({
  onPress,
  onLongPress,
  children,
  disabled,
}: {
  onPress?: () => void;
  onLongPress?: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  if (onPress || onLongPress) {
    const handleLongPress = onLongPress
      ? () => {
          hapticsBridge.longPress();
          onLongPress();
        }
      : undefined;
    return (
      <Pressable
        disabled={disabled}
        onPress={onPress}
        onLongPress={handleLongPress}
        delayLongPress={300}
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
        {children}
      </Pressable>
    );
  }
  return <View style={styles.row}>{children}</View>;
}

export function SettingsRow({
  icon,
  iconColor,
  label,
  description,
  value,
  valueAccent,
  destructive,
  onPress,
  onLongPress,
  right,
  trailing,
  hidden: _hidden,
}: {
  icon: IoniconName;
  iconColor?: string;
  label: string;
  description?: string;
  value?: string;
  valueAccent?: boolean;
  destructive?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  right?: ReactNode;
  trailing?: 'chevron' | 'none';
  hidden?: boolean;
}) {
  const { theme } = useTheme();
  const iconTint = destructive
    ? DESTRUCTIVE
    : iconColor ?? theme.text.primary;
  const labelColor = destructive ? DESTRUCTIVE : theme.text.primary;
  const showChevron = (trailing ?? (onPress ? 'chevron' : 'none')) === 'chevron';
  const valueColor = valueAccent ? theme.accent : theme.text.secondary;
  const valueWeight = valueAccent ? '600' : '500';

  return (
    <RowShell onPress={onPress} onLongPress={onLongPress}>
      <View style={styles.rowLeft}>
        <Ionicons name={icon} size={SettingsLayout.iconSize} color={iconTint} />
        <View style={styles.rowText}>
          <Text style={[styles.rowLabel, { color: labelColor }]} numberOfLines={1}>
            {label}
          </Text>
          {description ? (
            <Text
              style={[styles.rowDescription, { color: theme.text.secondary }]}
              numberOfLines={2}>
              {description}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={styles.rowRight}>
        {value ? (
          <Text style={[styles.rowValue, { color: valueColor, fontWeight: valueWeight }]}>
            {value}
          </Text>
        ) : null}
        {right}
        {showChevron ? (
          <Ionicons
            name="chevron-forward"
            size={SettingsLayout.chevronSize}
            color={theme.text.tertiary}
          />
        ) : null}
      </View>
    </RowShell>
  );
}

export function SettingsSwitchRow({
  icon,
  iconColor,
  label,
  description,
  value,
  onValueChange,
  onLongPress,
  trackColor,
  thumbColor,
  hidden: _hidden,
}: {
  icon: IoniconName;
  iconColor?: string;
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
  onLongPress?: () => void;
  trackColor?: { false: string; true: string };
  thumbColor?: string;
  hidden?: boolean;
}) {
  const { theme } = useTheme();
  return (
    <RowShell onLongPress={onLongPress}>
      <View style={styles.rowLeft}>
        <Ionicons
          name={icon}
          size={SettingsLayout.iconSize}
          color={iconColor ?? theme.text.primary}
        />
        <View style={styles.rowText}>
          <Text style={[styles.rowLabel, { color: theme.text.primary }]} numberOfLines={1}>
            {label}
          </Text>
          {description ? (
            <Text
              style={[styles.rowDescription, { color: theme.text.secondary }]}
              numberOfLines={2}>
              {description}
            </Text>
          ) : null}
        </View>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={trackColor ?? { false: theme.background.tertiary, true: theme.accent }}
        thumbColor={thumbColor ?? theme.text.primary}
      />
    </RowShell>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9999,
    borderWidth: 1,
  },
  headerTextWrap: {
    flex: 1,
    gap: 2,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
  },
  headerSubtitle: {
    fontSize: 14,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: Spacing.xs + 2,
    marginLeft: 4,
  },
  card: {
    borderRadius: SettingsLayout.cardRadius,
    borderWidth: 1,
    overflow: 'hidden',
  },
  separator: {
    height: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SettingsLayout.rowPaddingV,
    paddingHorizontal: SettingsLayout.rowPaddingH,
    gap: SettingsLayout.rowGap,
  },
  rowPressed: {
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SettingsLayout.rowGap,
    flex: 1,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowLabel: {
    fontSize: SettingsLayout.labelFontSize,
    fontWeight: '500',
    fontFamily: Typography.titleMedium.fontFamily,
  },
  rowDescription: {
    fontSize: SettingsLayout.descriptionFontSize,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowValue: {
    fontSize: 13,
    fontWeight: '500',
  },
});
