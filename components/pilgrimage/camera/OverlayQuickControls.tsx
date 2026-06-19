import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ThemedText, readableTextOn } from '../../themed';
import { useT } from '../../../libs/i18n';
import { hapticsBridge } from '../../../modules/haptics/hapticsBridge';
import {
  EDGE_INTENSITIES,
  edgeIntensityLabel,
  type EdgeIntensity,
} from '../../../libs/services/pilgrimage/edge-overlay';
import {
  SUBJECT_FOCI,
  subjectFocusLabel,
  type SubjectFocus,
} from '../../../libs/services/pilgrimage/subject-overlay';
import { CameraChrome, cameraControlShadow } from './cameraChrome';
import type { OverlayMode } from './types';

interface OverlayQuickControlsProps {
  mode: OverlayMode;
  edgeIntensity: EdgeIntensity;
  subjectFocus: SubjectFocus;
  subjectCombine: boolean;
  characterSelected: boolean;
  flipped: boolean;
  editMode: boolean;
  themeColor: string;
  onSelectEdgeIntensity: (intensity: EdgeIntensity) => void;
  onSelectSubjectFocus: (focus: SubjectFocus) => void;
  onToggleSubjectCombine: () => void;
  onOpenCharacterPicker: () => void;
  onToggleFlip: () => void;
  onToggleEdit: () => void;
}

/**
 * Compact popover shown near the overlay carousel when an overlay mode is active. Replaces the
 * OverlayControlsBar sub-rows (mode strip → carousel; opacity slider → zoom-band pill). Preserves
 * every sub-affordance: reposition, flip, edge intensity, subject combine, character picker — and
 * additionally surfaces the subject-focus tight/normal/wide selector that previously had no live UI.
 */
function OverlayQuickControlsComponent({
  mode,
  edgeIntensity,
  subjectFocus,
  subjectCombine,
  characterSelected,
  flipped,
  editMode,
  themeColor,
  onSelectEdgeIntensity,
  onSelectSubjectFocus,
  onToggleSubjectCombine,
  onOpenCharacterPicker,
  onToggleFlip,
  onToggleEdit,
}: OverlayQuickControlsProps) {
  const t = useT();

  const handleFlip = () => {
    hapticsBridge.tap();
    onToggleFlip();
  };

  return (
    <View style={styles.root} pointerEvents="box-none">
      {mode === 'edge' ? (
        <View style={styles.subRow}>
          <SubSegment
            icon="git-network-outline"
            options={EDGE_INTENSITIES.map((i) => ({ id: i, label: t(edgeIntensityLabel(i)) }))}
            activeId={edgeIntensity}
            themeColor={themeColor}
            onPick={(id) => onSelectEdgeIntensity(id as EdgeIntensity)}
          />
        </View>
      ) : null}

      {mode === 'subject' ? (
        <View style={styles.subRow}>
          <SubSegment
            icon="scan-outline"
            options={SUBJECT_FOCI.map((f) => ({ id: f, label: t(subjectFocusLabel(f)) }))}
            activeId={subjectFocus}
            themeColor={themeColor}
            onPick={(id) => onSelectSubjectFocus(id as SubjectFocus)}
          />
          <Pressable
            onPress={() => {
              hapticsBridge.selection();
              onToggleSubjectCombine();
            }}
            accessibilityRole="checkbox"
            accessibilityLabel={t('pilgrimageUi.combineSubjectOverlayIntoThe')}
            accessibilityState={{ checked: subjectCombine }}
            style={({ pressed }) => [
              styles.combinePill,
              subjectCombine && { backgroundColor: themeColor, borderColor: themeColor },
              pressed && { opacity: 0.7 },
            ]}>
            <Ionicons
              name={subjectCombine ? 'checkmark-circle' : 'ellipse-outline'}
              size={14}
              color={subjectCombine ? readableTextOn(themeColor) : '#fff'}
            />
            <ThemedText
              variant="captionSmall"
              weight="700"
              style={{ color: subjectCombine ? readableTextOn(themeColor) : '#fff' }}>
              {t('pilgrimageUi.combine')}
            </ThemedText>
          </Pressable>
          <Pressable
            onPress={() => {
              hapticsBridge.tap();
              onOpenCharacterPicker();
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={
              characterSelected ? t('pilgrimageUi.swapCharacter') : t('pilgrimageUi.pickCharacter')
            }
            accessibilityState={{ selected: characterSelected }}
            style={({ pressed }) => [
              styles.characterPill,
              characterSelected && { backgroundColor: themeColor, borderColor: themeColor },
              pressed && { opacity: 0.7 },
            ]}>
            <Ionicons
              name={characterSelected ? 'person' : 'person-add-outline'}
              size={14}
              color={characterSelected ? readableTextOn(themeColor) : '#fff'}
            />
            <ThemedText
              variant="captionSmall"
              weight="700"
              numberOfLines={1}
              style={{ color: characterSelected ? readableTextOn(themeColor) : '#fff' }}>
              {t('pilgrimageUi.character')}
            </ThemedText>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.actionRow}>
        <IconBtn
          icon={editMode ? 'lock-open-outline' : 'move-outline'}
          active={editMode}
          themeColor={themeColor}
          accessibilityLabel={
            editMode ? t('pilgrimageUi.lockOverlayPosition') : t('pilgrimageUi.repositionOverlay')
          }
          onPress={onToggleEdit}
        />
        <IconBtn
          icon="swap-horizontal-outline"
          active={flipped}
          themeColor={themeColor}
          accessibilityLabel={t('pilgrimageUi.flipOverlayHorizontally')}
          onPress={handleFlip}
        />
      </View>
    </View>
  );
}

function SubSegment({
  icon,
  options,
  activeId,
  themeColor,
  onPick,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  options: { id: string; label: string }[];
  activeId: string;
  themeColor: string;
  onPick: (id: string) => void;
}) {
  return (
    <View style={styles.subSegment}>
      <Ionicons name={icon} size={13} color={CameraChrome.fgMuted} style={styles.subSegmentIcon} />
      {options.map((o) => {
        const active = o.id === activeId;
        const fg = active ? readableTextOn(themeColor) : CameraChrome.fg;
        return (
          <Pressable
            key={o.id}
            onPress={() => {
              if (o.id === activeId) return;
              hapticsBridge.selection();
              onPick(o.id);
            }}
            accessibilityRole="button"
            accessibilityLabel={o.label}
            accessibilityState={{ selected: active }}
            style={({ pressed }) => [
              styles.subSegmentBtn,
              active && { backgroundColor: themeColor },
              pressed && !active && styles.pillPressed,
            ]}>
            <ThemedText variant="captionSmall" weight="700" numberOfLines={1} style={{ color: fg }}>
              {o.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

function IconBtn({
  icon,
  active,
  themeColor,
  accessibilityLabel,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  active: boolean;
  themeColor: string;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [
        styles.iconBtn,
        active ? { backgroundColor: themeColor, borderColor: themeColor } : null,
        pressed && { opacity: 0.7 },
      ]}>
      <Ionicons name={icon} size={17} color={active ? readableTextOn(themeColor) : '#fff'} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { gap: 8, alignItems: 'center' },
  subRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 8 },
  subSegment: {
    flexDirection: 'row',
    alignItems: 'center',
    height: CameraChrome.subControlHeight,
    paddingLeft: 10,
    paddingRight: 4,
    gap: 3,
    flexShrink: 1,
    borderRadius: CameraChrome.pillRadius,
    backgroundColor: CameraChrome.controlFill,
    borderWidth: 1,
    borderColor: CameraChrome.border,
    ...cameraControlShadow,
  },
  subSegmentIcon: { marginRight: 3 },
  subSegmentBtn: {
    minWidth: 46,
    height: 26,
    paddingHorizontal: 10,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillPressed: { backgroundColor: 'rgba(255,255,255,0.12)' },
  combinePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: CameraChrome.subControlHeight,
    paddingHorizontal: 12,
    borderRadius: CameraChrome.pillRadius,
    backgroundColor: CameraChrome.controlFill,
    borderWidth: 1,
    borderColor: CameraChrome.border,
    ...cameraControlShadow,
  },
  characterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: CameraChrome.pillRadius,
    backgroundColor: CameraChrome.controlFill,
    borderWidth: 1,
    borderColor: CameraChrome.border,
    ...cameraControlShadow,
  },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: CameraChrome.pillRadius,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CameraChrome.controlFill,
    borderWidth: 1,
    borderColor: CameraChrome.border,
    ...cameraControlShadow,
  },
});

export default memo(OverlayQuickControlsComponent);
