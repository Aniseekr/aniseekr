import { Fragment } from 'react';
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Radius, Shadow, Size, Spacing } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { useT } from '../../libs/i18n';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import { SheetBackdrop, ThemedText } from '../themed';

type IoniconName = keyof typeof Ionicons.glyphMap;

interface PilgrimageToolsMenuProps {
  visible: boolean;
  onClose: () => void;
  onOpenCharacters: () => void;
  onOpenAlbum: () => void;
  onOpenCamera: () => void;
  onIdentifyScene: () => void;
  onOpenNews: () => void;
}

interface ToolAction {
  key: string;
  label: string;
  icon: IoniconName;
  onPress: () => void;
}

const MENU_MAX_WIDTH = 320;

export function PilgrimageToolsMenu({
  visible,
  onClose,
  onOpenCharacters,
  onOpenAlbum,
  onOpenCamera,
  onIdentifyScene,
  onOpenNews,
}: PilgrimageToolsMenuProps) {
  const { theme } = useTheme();
  const { top } = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const t = useT();
  const actions: ToolAction[] = [
    {
      key: 'camera',
      label: t('pilgrimage.capture.title'),
      icon: 'camera-outline',
      onPress: onOpenCamera,
    },
    {
      key: 'identify',
      label: t('pilgrimage.identify.entry'),
      icon: 'scan-outline',
      onPress: onIdentifyScene,
    },
    {
      key: 'album',
      label: t('tabs.pilgrimageScreen.myAlbumA11y'),
      icon: 'albums-outline',
      onPress: onOpenAlbum,
    },
    {
      key: 'news',
      label: t('news.hubEntry'),
      icon: 'newspaper-outline',
      onPress: onOpenNews,
    },
    {
      key: 'characters',
      label: t('tabs.pilgrimageScreen.charactersA11y'),
      icon: 'people-outline',
      onPress: onOpenCharacters,
    },
  ];

  const handlePick = (action: ToolAction) => {
    hapticsBridge.selection();
    onClose();
    action.onPress();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.root}>
        <SheetBackdrop onPress={onClose} />
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
          <ThemedText variant="titleMedium" weight="700" style={styles.title}>
            {t('tabs.pilgrimageScreen.moreActions')}
          </ThemedText>

          {actions.map((action, index) => (
            <Fragment key={action.key}>
              <Pressable
                onPress={() => handlePick(action)}
                accessibilityRole="button"
                accessibilityLabel={action.label}
                style={({ pressed }) => [
                  styles.action,
                  pressed && { backgroundColor: theme.background.tertiary },
                ]}>
                <Ionicons name={action.icon} size={20} color={theme.text.secondary} />
                <ThemedText variant="bodySmall" weight="600" style={styles.actionLabel}>
                  {action.label}
                </ThemedText>
                <Ionicons name="chevron-forward" size={15} color={theme.text.tertiary} />
              </Pressable>
              {index < actions.length - 1 ? (
                <View style={[styles.divider, { backgroundColor: theme.glassBorder }]} />
              ) : null}
            </Fragment>
          ))}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
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
  title: {
    paddingHorizontal: Spacing.sm,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.sm,
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
