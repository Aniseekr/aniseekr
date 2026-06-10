// PilgrimageSortPill — compact pill that shows the current sort order and
// opens a dropdown of the available orders anchored beneath it. The "排序入口"
// for the hub's My Collection rail (and, later, the See-all list).
//
// Modelled on SeriesDropdownPill: the pill measures itself on press so the
// menu anchors to its real on-screen position regardless of sibling chrome.
// Right-aligned because it lives at the right end of a section header next to
// "See all". Sort keys + ordering come from pilgrimage-collection-sort; labels
// route through useT() (CLAUDE.md Rule 11).

import React, { memo, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type View as RNView,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Radius, Shadow, Spacing } from '../../constants/DesignSystem';
import { ThemedText } from '../themed';
import type { ThemePalette } from '../../context/ThemeContext';
import { useT, type TranslationKey } from '../../libs/i18n';
import type { PilgrimageSortKey } from '../../libs/services/pilgrimage/pilgrimage-collection-sort';

const SORT_LABEL_KEY: Record<PilgrimageSortKey, TranslationKey> = {
  distance: 'pilgrimage.sort.nearest',
  spots: 'pilgrimage.sort.spots',
  title: 'pilgrimage.sort.title',
};

export interface PilgrimageSortPillProps {
  /** The effective key (already resolved against location availability). */
  sortKey: PilgrimageSortKey;
  /** Keys to offer — typically resolvePilgrimageSortKeys(hasLocation). */
  availableKeys: readonly PilgrimageSortKey[];
  theme: ThemePalette;
  onSelect: (key: PilgrimageSortKey) => void;
}

interface Anchor {
  x: number;
  y: number;
  w: number;
  h: number;
}

function PilgrimageSortPillImpl({ sortKey, availableKeys, theme, onSelect }: PilgrimageSortPillProps) {
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const t = useT();
  const pillRef = useRef<RNView>(null);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<Anchor | null>(null);

  // A single option is no choice — render nothing rather than a dead pill.
  if (availableKeys.length < 2) return null;

  const handlePress = () => {
    pillRef.current?.measureInWindow((x, y, w, h) => {
      setAnchor({ x, y, w, h });
      setOpen(true);
    });
  };

  const handleClose = () => setOpen(false);
  const handlePick = (next: PilgrimageSortKey) => {
    onSelect(next);
    setOpen(false);
  };

  const menuTop = anchor ? anchor.y + anchor.h + 6 : 0;
  // Right-align the menu to the pill's right edge so it doesn't run off-screen.
  const menuRight = anchor ? Math.max(Spacing.sm, Dimensions.get('window').width - (anchor.x + anchor.w)) : Spacing.sm;

  return (
    <>
      <Pressable
        ref={pillRef}
        onPress={handlePress}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={t('pilgrimage.sort.changeA11y')}
        style={({ pressed }) => [styles.pill, pressed && { opacity: 0.7 }]}>
        <Ionicons name="swap-vertical" size={13} color={theme.text.secondary} />
        <ThemedText variant="captionSmall" weight="700" tone="secondary">
          {t(SORT_LABEL_KEY[sortKey])}
        </ThemedText>
        <Ionicons name="chevron-down" size={12} color={theme.text.tertiary} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={handleClose}>
        <Pressable style={styles.backdrop} onPress={handleClose}>
          {anchor ? (
            <View
              style={[styles.menu, { top: menuTop, right: menuRight }]}
              onStartShouldSetResponder={() => true}>
              <View style={styles.menuHeader}>
                <ThemedText variant="captionSmall" weight="700" tone="tertiary">
                  {t('pilgrimage.sort.by')}
                </ThemedText>
              </View>
              <ScrollView
                bounces={false}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.menuContent}>
                {availableKeys.map((key) => (
                  <SortMenuItem
                    key={key}
                    label={t(SORT_LABEL_KEY[key])}
                    active={key === sortKey}
                    theme={theme}
                    onPress={() => handlePick(key)}
                  />
                ))}
              </ScrollView>
            </View>
          ) : null}
        </Pressable>
      </Modal>
    </>
  );
}

function areEqual(prev: PilgrimageSortPillProps, next: PilgrimageSortPillProps): boolean {
  return (
    prev.sortKey === next.sortKey &&
    prev.availableKeys === next.availableKeys &&
    prev.theme === next.theme &&
    prev.onSelect === next.onSelect
  );
}

export const PilgrimageSortPill = memo(PilgrimageSortPillImpl, areEqual);

interface SortMenuItemProps {
  label: string;
  active: boolean;
  theme: ThemePalette;
  onPress: () => void;
}

function SortMenuItem({ label, active, theme, onPress }: SortMenuItemProps) {
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [
        styles.item,
        active && { backgroundColor: `${theme.accent}1A` },
        pressed && !active && { backgroundColor: theme.background.tertiary },
      ]}>
      <ThemedText
        variant="bodySmall"
        weight={active ? '700' : '500'}
        style={{ color: active ? theme.accent : theme.text.primary, flex: 1 }}>
        {label}
      </ThemedText>
      {active ? <Ionicons name="checkmark" size={16} color={theme.accent} /> : null}
    </Pressable>
  );
}

function makeStyles(theme: ThemePalette) {
  return StyleSheet.create({
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingLeft: 10,
      paddingRight: 8,
      paddingVertical: 6,
      minHeight: 32,
      borderRadius: Radius.full,
      backgroundColor: theme.background.secondary,
      borderWidth: 1,
      borderColor: theme.glassBorder,
    },
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.35)',
    },
    menu: {
      position: 'absolute',
      minWidth: 180,
      maxWidth: 240,
      maxHeight: 320,
      borderRadius: Radius.lg,
      backgroundColor: theme.background.secondary,
      borderWidth: 1,
      borderColor: theme.glassBorder,
      overflow: 'hidden',
      ...Shadow.medium,
    },
    menuHeader: {
      paddingHorizontal: Spacing.md,
      paddingTop: 10,
      paddingBottom: 4,
    },
    menuContent: {
      paddingBottom: 6,
    },
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: Spacing.md,
      paddingVertical: 10,
      minHeight: 44,
    },
  });
}
