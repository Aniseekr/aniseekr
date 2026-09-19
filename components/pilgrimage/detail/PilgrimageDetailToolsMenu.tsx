import { Fragment, useState } from 'react';
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Radius, Shadow, Size, Spacing } from '../../../constants/DesignSystem';
import { useTheme } from '../../../context/ThemeContext';
import { useT } from '../../../libs/i18n';
import { SheetBackdrop, ThemedText } from '../../themed';

interface PilgrimageDetailToolsMenuProps {
  hasMap: boolean;
  mapMarkerMode: 'photo' | 'dot';
  mapOfflineOnly: boolean;
  themeColor: string;
  onShare: () => void;
  onToggleMarkerMode: () => void;
  onToggleOfflineOnly: () => void;
}

interface ToolAction {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  active?: boolean;
  onPress: () => void;
}

const MENU_MAX_WIDTH = 320;

/**
 * One intentional entry point for secondary detail actions. The layer icon
 * describes what is inside; the anchored menu keeps map context visible and
 * avoids turning utility actions into another pull-up sheet.
 */
export function PilgrimageDetailToolsMenu({
  hasMap,
  mapMarkerMode,
  mapOfflineOnly,
  themeColor,
  onShare,
  onToggleMarkerMode,
  onToggleOfflineOnly,
}: PilgrimageDetailToolsMenuProps) {
  const [visible, setVisible] = useState(false);
  const { theme } = useTheme();
  const { top } = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const t = useT();

  const actions: ToolAction[] = [
    {
      key: 'share',
      label: t('pilgrimage.detail.shareA11y'),
      icon: 'share-outline',
      onPress: onShare,
    },
    ...(hasMap
      ? [
          {
            key: 'marker-mode',
            label:
              mapMarkerMode === 'photo'
                ? t('pilgrimage.detail.useDotMarkersA11y')
                : t('pilgrimage.detail.usePhotoMarkersA11y'),
            icon: (mapMarkerMode === 'photo'
              ? 'ellipse-outline'
              : 'image-outline') as keyof typeof Ionicons.glyphMap,
            onPress: onToggleMarkerMode,
          },
          {
            key: 'offline',
            label: mapOfflineOnly
              ? t('pilgrimage.detail.useOnlineTilesA11y')
              : t('pilgrimage.detail.useCachedTilesA11y'),
            icon: 'cloud-offline-outline' as const,
            active: mapOfflineOnly,
            onPress: onToggleOfflineOnly,
          },
        ]
      : []),
  ];

  const handlePick = (action: ToolAction) => {
    setVisible(false);
    action.onPress();
  };

  return (
    <>
      <Pressable
        onPress={() => setVisible(true)}
        accessibilityRole="button"
        accessibilityLabel={t('pilgrimage.detail.openToolsA11y')}
        hitSlop={6}
        style={({ pressed }) => [
          styles.trigger,
          {
            backgroundColor: `${theme.background.secondary}E8`,
            borderColor: `${themeColor}55`,
          },
          pressed && { opacity: 0.78 },
        ]}>
        <Ionicons name="layers-outline" size={19} color={themeColor} />
      </Pressable>

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}>
        <View style={styles.root}>
          <SheetBackdrop onPress={() => setVisible(false)} />
          <View
            accessibilityViewIsModal
            style={[
              styles.menu,
              {
                top: top + 58,
                width: Math.min(width - Spacing.lg * 2, MENU_MAX_WIDTH),
                backgroundColor: theme.background.secondary,
                borderColor: theme.glassBorder,
              },
            ]}>
            <View style={styles.titleRow}>
              <Ionicons name="layers-outline" size={18} color={themeColor} />
              <ThemedText variant="titleMedium" weight="700">
                {t('pilgrimage.detail.toolsTitle')}
              </ThemedText>
            </View>

            {actions.map((action, index) => (
              <Fragment key={action.key}>
                <Pressable
                  onPress={() => handlePick(action)}
                  accessibilityRole="button"
                  accessibilityLabel={action.label}
                  accessibilityState={
                    action.key === 'offline' ? { selected: action.active } : undefined
                  }
                  style={({ pressed }) => [
                    styles.action,
                    pressed && { backgroundColor: theme.background.tertiary },
                  ]}>
                  <Ionicons
                    name={action.icon}
                    size={20}
                    color={action.active ? themeColor : theme.text.secondary}
                  />
                  <ThemedText variant="bodySmall" weight="600" style={styles.actionLabel}>
                    {action.label}
                  </ThemedText>
                  {action.key === 'offline' ? (
                    <ThemedText
                      variant="captionSmall"
                      weight="700"
                      style={{ color: action.active ? themeColor : theme.text.tertiary }}>
                      {t(action.active ? 'common.on' : 'common.off')}
                    </ThemedText>
                  ) : (
                    <Ionicons name="chevron-forward" size={15} color={theme.text.tertiary} />
                  )}
                </Pressable>
                {index < actions.length - 1 ? (
                  <View style={[styles.divider, { backgroundColor: theme.glassBorder }]} />
                ) : null}
              </Fragment>
            ))}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  trigger: {
    width: Size.minTouchTarget,
    height: Size.minTouchTarget,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menu: {
    position: 'absolute',
    right: Spacing.lg,
    overflow: 'hidden',
    borderRadius: Radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.xs,
    ...Shadow.medium,
  },
  titleRow: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },
  action: {
    minHeight: Size.recommendedTouchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.md,
  },
  actionLabel: {
    flex: 1,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: Spacing.sm + 20 + Spacing.sm,
  },
});
