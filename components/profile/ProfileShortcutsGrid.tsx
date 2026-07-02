import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Radius, Spacing } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { ThemedText, readableTextOn } from '../themed';
import { QuickActionSheet, type QuickAction } from '../settings/QuickActionSheet';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import { useT } from '../../libs/i18n';
import {
  PROFILE_SHORTCUT_COUNT,
  getShortcutSpec,
  listShortcuts,
  type ShortcutId,
  type ShortcutSpec,
} from '../../libs/services/profile-shortcuts';

interface ProfileShortcutsGridProps {
  shortcuts: ShortcutId[];
  onChange: (next: ShortcutId[]) => void;
}

export function ProfileShortcutsGrid({ shortcuts, onChange }: ProfileShortcutsGridProps) {
  const { theme } = useTheme();
  const t = useT();
  const [editingSlot, setEditingSlot] = useState<number | null>(null);
  const [editMode, setEditMode] = useState(false);

  const slots = useMemo<(ShortcutSpec | null)[]>(
    () =>
      Array.from({ length: PROFILE_SHORTCUT_COUNT }, (_, i) =>
        getShortcutSpec(shortcuts[i] ?? ''),
      ),
    [shortcuts],
  );

  const handleTilePress = (slot: number, spec: ShortcutSpec | null) => {
    if (!spec) return;
    if (editMode) {
      hapticsBridge.selection();
      setEditingSlot(slot);
      return;
    }
    hapticsBridge.tap();
    router.push(spec.route);
  };

  const handleTileLongPress = (slot: number) => {
    hapticsBridge.longPress();
    setEditingSlot(slot);
  };

  const handlePick = (id: ShortcutId) => {
    if (editingSlot === null) return;
    const next = [...shortcuts];
    const current = next[editingSlot];
    const otherIdx = next.indexOf(id);
    if (otherIdx >= 0 && otherIdx !== editingSlot && current) {
      next[otherIdx] = current;
    }
    next[editingSlot] = id;
    onChange(next);
  };

  const sheetActions: QuickAction[] = useMemo(() => {
    if (editingSlot === null) return [];
    const inUse = new Set(shortcuts);
    const current = shortcuts[editingSlot];
    return listShortcuts().map((spec) => {
      const usedElsewhere = inUse.has(spec.id) && spec.id !== current;
      return {
        key: spec.id,
        label: spec.label,
        description: usedElsewhere ? 'Swap with another slot' : undefined,
        icon: spec.icon,
        selected: spec.id === current,
        onPress: () => handlePick(spec.id),
      };
    });
  }, [editingSlot, shortcuts]);

  const rows: (ShortcutSpec | null)[][] = [slots.slice(0, 4), slots.slice(4, 8)];

  const pillBg = editMode ? theme.accent : theme.background.tertiary;
  const pillBorder = editMode ? theme.accent : theme.glassBorder;
  const pillFg = editMode ? readableTextOn(theme.accent) : theme.text.primary;
  const pillIcon = editMode ? 'checkmark' : 'pencil';
  const pillLabel = editMode ? t('common.done') : t('common.edit');

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <ThemedText variant="titleLarge" weight="700">
            {t('profile.quickShortcuts')}
          </ThemedText>
          <Ionicons name="sparkles" size={14} color={theme.accent} />
        </View>
        <Pressable
          onPress={() => {
            hapticsBridge.selection();
            setEditMode((v) => !v);
          }}
          accessibilityRole="button"
          accessibilityLabel={editMode ? 'Finish editing shortcuts' : 'Edit shortcuts'}
          style={({ pressed }) => [
            styles.editPill,
            { backgroundColor: pillBg, borderColor: pillBorder },
            pressed && { opacity: 0.85 },
          ]}>
          <Ionicons name={pillIcon} size={12} color={pillFg} />
          <ThemedText variant="caption" weight="600" style={{ color: pillFg }}>
            {pillLabel}
          </ThemedText>
        </Pressable>
      </View>

      <View style={styles.grid}>
        {rows.map((row, ri) => (
          <View key={ri} style={styles.row}>
            {row.map((spec, ci) => {
              const slotIdx = ri * 4 + ci;
              return (
                <ShortcutTile
                  key={slotIdx}
                  spec={spec}
                  editMode={editMode}
                  onPress={() => handleTilePress(slotIdx, spec)}
                  onLongPress={() => handleTileLongPress(slotIdx)}
                />
              );
            })}
          </View>
        ))}
      </View>

      {editingSlot !== null ? (
        <QuickActionSheet
          visible
          onClose={() => setEditingSlot(null)}
          title={t('profile.replaceShortcut')}
          subtitle={t('profile.tapAShortcutToPut')}
          actions={sheetActions}
        />
      ) : null}
    </View>
  );
}

function ShortcutTile({
  spec,
  editMode,
  onPress,
  onLongPress,
}: {
  spec: ShortcutSpec | null;
  editMode: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const { theme } = useTheme();
  const borderColor = editMode && spec ? theme.accent : theme.glassBorder;
  const bg = theme.background.secondary;
  const tint = spec?.tint ?? theme.text.tertiary;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      disabled={!spec}
      style={({ pressed }) => [
        styles.tile,
        { backgroundColor: bg, borderColor },
        editMode && spec ? { borderWidth: 1.5 } : null,
        pressed && spec ? { opacity: 0.85 } : null,
      ]}
      accessibilityRole="button"
      accessibilityLabel={
        spec
          ? editMode
            ? `${spec.label}. Tap to replace.`
            : `${spec.label}. Long-press to replace.`
          : 'Empty shortcut slot'
      }>
      <View
        style={[
          styles.iconWrap,
          { backgroundColor: tintWithAlpha(tint, 0.14) },
        ]}>
        <Ionicons name={spec?.icon ?? 'add'} size={20} color={tint} />
      </View>
      <ThemedText
        variant="captionSmall"
        weight="500"
        numberOfLines={1}
        style={styles.tileLabel}>
        {spec?.label ?? 'Empty'}
      </ThemedText>
    </Pressable>
  );
}

function tintWithAlpha(hex: string, alpha: number): string {
  // Accepts #RGB, #RRGGBB, or rgba()-like; falls back to original on failure.
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const raw = m[1];
  const expanded =
    raw.length === 3
      ? raw
          .split('')
          .map((c) => c + c)
          .join('')
      : raw;
  const a = Math.max(0, Math.min(1, alpha));
  const aa = Math.round(a * 255)
    .toString(16)
    .padStart(2, '0');
  return `#${expanded}${aa}`;
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  editPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  grid: {
    gap: Spacing.xs,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  tile: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: 14,
    paddingHorizontal: 6,
    borderRadius: Radius.lg,
    borderWidth: 1,
    minHeight: 88,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel: {
    textAlign: 'center',
  },
});
