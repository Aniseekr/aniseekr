import { useMemo } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme, type ThemePalette } from '../../context/ThemeContext';
import { readableTextOn } from '../themed';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import type { SwipeMode } from '../../libs/services/user-prefs';

type IconName = keyof typeof Ionicons.glyphMap;

export type ModeOption = {
  value: SwipeMode;
  label: string;
  icon: IconName;
  /** Active-state colour for this mode. Falls back to theme.accent when omitted. */
  color?: string;
};

type Props = {
  visible: boolean;
  value: SwipeMode;
  options: readonly ModeOption[];
  onSelect: (mode: SwipeMode) => void;
  onClose: () => void;
};

/**
 * Compact bottom sheet that surfaces the current swipe mode with a
 * segmented switch. The active mode pill (rendered separately in the
 * header) opens this sheet — once a mode is chosen, it auto-closes.
 */
export function ModeSwitcherSheet({ visible, value, options, onSelect, onClose }: Props) {
  const { theme, effectiveMode } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const blurTint = effectiveMode === 'light' ? 'systemThickMaterialLight' : 'systemThickMaterialDark';

  const activeOption = options.find((o) => o.value === value) ?? options[0];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Dismiss">
        <Pressable
          style={styles.sheetWrapper}
          onPress={(e) => e.stopPropagation()}
          accessible={false}>
          <View style={styles.sheet}>
            {Platform.OS === 'ios' ? (
              <BlurView intensity={60} tint={blurTint} style={StyleSheet.absoluteFill} />
            ) : null}
            <View style={styles.sheetBackground} pointerEvents="none" />
            <View style={styles.sheetBorder} pointerEvents="none" />

            <View style={styles.content}>
              <Text style={styles.title}>{`You're in ${activeOption?.label ?? ''} mode.`}</Text>
              <Text style={styles.subtitle}>Tap to change.</Text>

              <View style={styles.segmentRow}>
                {options.map((option) => {
                  const isActive = option.value === value;
                  const activeBg = option.color ?? theme.accent;
                  const activeFg = readableTextOn(activeBg);
                  return (
                    <Pressable
                      key={option.value}
                      onPress={() => {
                        hapticsBridge.selection();
                        onSelect(option.value);
                        onClose();
                      }}
                      style={[
                        styles.segment,
                        isActive && { backgroundColor: activeBg },
                      ]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isActive }}
                      accessibilityLabel={`${option.label} mode`}>
                      <Ionicons
                        name={option.icon}
                        size={16}
                        color={isActive ? activeFg : theme.text.secondary}
                      />
                      <Text
                        style={[
                          styles.segmentLabel,
                          { color: isActive ? activeFg : theme.text.secondary },
                        ]}>
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (theme: ThemePalette) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24,
    },
    sheetWrapper: {
      width: '100%',
      maxWidth: 420,
    },
    sheet: {
      borderRadius: 28,
      overflow: 'hidden',
      backgroundColor: 'rgba(15,15,18,0.92)',
    },
    sheetBackground: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: `${theme.background.secondary}D8`,
    },
    sheetBorder: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: 28,
      borderWidth: 1,
      borderColor: theme.glassBorder,
    },
    content: {
      paddingHorizontal: 24,
      paddingTop: 28,
      paddingBottom: 20,
      alignItems: 'center',
    },
    title: {
      color: theme.text.primary,
      fontSize: 22,
      fontWeight: '700',
      textAlign: 'center',
    },
    subtitle: {
      color: theme.text.secondary,
      fontSize: 14,
      fontWeight: '500',
      marginTop: 6,
      marginBottom: 22,
      textAlign: 'center',
    },
    segmentRow: {
      flexDirection: 'row',
      alignSelf: 'stretch',
      gap: 8,
      padding: 6,
      borderRadius: 18,
      backgroundColor: theme.background.tertiary,
      borderWidth: 1,
      borderColor: theme.glassBorder,
    },
    segment: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: 14,
    },
    segmentLabel: {
      fontSize: 15,
      fontWeight: '700',
      letterSpacing: 0.2,
    },
  });
