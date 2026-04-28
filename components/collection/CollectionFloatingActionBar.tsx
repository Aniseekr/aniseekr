import { memo } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { Spacing, Typography } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';

export type CollectionMode = 'collect' | 'share';

interface CollectionFloatingActionBarProps {
  mode: CollectionMode;
  unratedCount?: number;
  selectedCount?: number;
  onRateUnrated?: () => void;
  onCreateFolder?: () => void;
  onQuickShare?: () => void;
  onConfirmShare?: () => void;
  onCancelShare?: () => void;
  bottom?: number;
  style?: ViewStyle;
}

function CollectionFloatingActionBarComponent({
  mode,
  unratedCount = 0,
  selectedCount = 0,
  onRateUnrated,
  onCreateFolder,
  onQuickShare,
  onConfirmShare,
  onCancelShare,
  bottom = 96,
  style,
}: CollectionFloatingActionBarProps) {
  const { theme } = useTheme();

  return (
    <Animated.View
      entering={FadeInDown.duration(180)}
      exiting={FadeOutDown.duration(180)}
      pointerEvents="box-none"
      style={[styles.container, { bottom }, style]}>
      <View style={styles.bar}>
        {Platform.OS === 'ios' ? (
          <BlurView
            intensity={36}
            tint="dark"
            style={[StyleSheet.absoluteFill, styles.barFill]}
          />
        ) : null}
        <View
          style={[
            styles.barBackground,
            {
              backgroundColor:
                Platform.OS === 'ios'
                  ? 'rgba(28,28,30,0.55)'
                  : theme.background.secondary,
              borderColor: theme.glassBorder,
            },
          ]}
          pointerEvents="none"
        />
        {mode === 'collect' ? (
          <View style={styles.row}>
            {unratedCount > 0 && onRateUnrated ? (
              <ActionButton
                icon="auto-awesome"
                label={`Rate ${Math.min(unratedCount, 3)}`}
                hint={`${unratedCount} unrated`}
                accent={theme.accent}
                onPress={() => {
                  hapticsBridge.tap();
                  onRateUnrated();
                }}
              />
            ) : null}
            {onCreateFolder ? (
              <ActionButton
                icon="create-new-folder"
                label="New folder"
                accent={theme.accent}
                onPress={() => {
                  hapticsBridge.tap();
                  onCreateFolder();
                }}
              />
            ) : null}
            {onQuickShare ? (
              <ActionButton
                icon="ios-share"
                label="Share"
                accent={theme.accent}
                onPress={() => {
                  hapticsBridge.tap();
                  onQuickShare();
                }}
              />
            ) : null}
          </View>
        ) : (
          <View style={styles.row}>
            {onCancelShare ? (
              <ActionButton
                icon="close"
                label="Cancel"
                accent={theme.text.secondary}
                onPress={() => {
                  hapticsBridge.tap();
                  onCancelShare();
                }}
              />
            ) : null}
            <View style={styles.selectionBadge}>
              <Text
                style={[styles.selectionText, { color: theme.text.primary }]}>
                {selectedCount} selected
              </Text>
            </View>
            {onConfirmShare ? (
              <ActionButton
                icon="check"
                label="Share"
                accent="#0E0A06"
                background={theme.accent}
                onPress={() => {
                  hapticsBridge.success();
                  onConfirmShare();
                }}
              />
            ) : null}
          </View>
        )}
      </View>
    </Animated.View>
  );
}

function ActionButton({
  icon,
  label,
  hint,
  accent,
  background,
  onPress,
}: {
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  label: string;
  hint?: string;
  accent: string;
  background?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        background ? { backgroundColor: background } : null,
        { opacity: pressed ? 0.85 : 1 },
      ]}>
      <MaterialIcons name={icon} size={20} color={accent} />
      <View>
        <Text style={[styles.buttonLabel, { color: accent }]}>{label}</Text>
        {hint ? (
          <Text style={[styles.buttonHint, { color: accent }]}>{hint}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: Spacing.md,
    right: Spacing.md,
    alignItems: 'center',
  },
  bar: {
    width: '100%',
    borderRadius: 28,
    overflow: 'hidden',
    paddingHorizontal: 6,
    paddingVertical: 6,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.18,
        shadowRadius: 16,
      },
      android: { elevation: 12 },
    }),
  },
  barFill: {
    borderRadius: 28,
  },
  barBackground: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 28,
    borderWidth: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.xs,
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 22,
  },
  buttonLabel: {
    ...Typography.titleSmall,
    fontWeight: '700',
  },
  buttonHint: {
    ...Typography.captionSmall,
    opacity: 0.85,
  },
  selectionBadge: {
    paddingHorizontal: 12,
  },
  selectionText: {
    ...Typography.titleSmall,
    fontWeight: '700',
  },
});

export const CollectionFloatingActionBar = memo(CollectionFloatingActionBarComponent);
