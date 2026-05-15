import { type ReactNode, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ThemedText } from '../../themed';
import { useTheme } from '../../../context/ThemeContext';
import { hapticsBridge } from '../../../modules/haptics/hapticsBridge';
import {
  CAMERA_TOOL_MENU_MIN_PANEL_WIDTH,
  CAMERA_TOOL_MENU_PANEL_WIDTH,
} from '../../../libs/services/pilgrimage/camera-ui';

type ToolView = 'root' | 'overlay' | 'exposure';

interface CameraToolMenuProps {
  visible: boolean;
  onRequestClose: () => void;
  themeColor: string;
  /** Distance from the screen top to the panel's top edge. */
  topOffset: number;
  /**
   * Horizontal anchor — exactly one is set. Portrait hugs the right margin;
   * landscape hugs the left rail.
   */
  leftOffset?: number;
  rightOffset?: number;
  /** Chrome height the panel must not grow into — caps the body, then it scrolls. */
  bottomReserve: number;
  /** Quick-toggle chips (self-timer / aspect / orientation / settings) for the root view. */
  cycleChips: ReactNode;
  overlaySummary: string;
  overlayControls: ReactNode;
  /** `null` hides the exposure row — used while AF/AE is locked (the focus bar owns EV then). */
  exposureSummary: string | null;
  exposureControls: ReactNode;
  /** Opens the framing-tips / alignment screen. */
  onOpenTips: () => void;
}

/**
 * The camera "More" menu — a screen-root popover that drops DOWN from the
 * top-bar ⋯ trigger, so it sits above every camera HUD layer and is reliably
 * touchable.
 *
 * It is a drill-down menu, NOT a stack of pop-outs: the root view lists the
 * tools, and tapping a rich tool (overlay / exposure) REPLACES the panel body
 * with that tool's controls + a back arrow. Nothing ever floats on top of
 * anything else, so there is no overlap to clip or mis-position.
 */
export default function CameraToolMenu({
  visible,
  onRequestClose,
  themeColor,
  topOffset,
  leftOffset,
  rightOffset,
  bottomReserve,
  cycleChips,
  overlaySummary,
  overlayControls,
  exposureSummary,
  exposureControls,
  onOpenTips,
}: CameraToolMenuProps) {
  const { theme } = useTheme();
  const { width: winW, height: winH } = useWindowDimensions();
  const [view, setView] = useState<ToolView>('root');

  // Always reopen on the root view — the user expects a fresh menu, not
  // whichever sub-panel they happened to leave open last time.
  useEffect(() => {
    if (!visible) setView('root');
  }, [visible]);

  if (!visible) return null;

  // Clamp width so the panel always keeps a ≥16px margin on both screen edges.
  const panelWidth = Math.max(
    CAMERA_TOOL_MENU_MIN_PANEL_WIDTH,
    Math.min(CAMERA_TOOL_MENU_PANEL_WIDTH, winW - 32)
  );
  // The panel hangs off the top bar; cap the body so it never runs into the
  // fixed bottom bar — it scrolls instead (matters in short landscape windows).
  const maxBodyHeight = Math.max(180, winH - topOffset - bottomReserve - 16);

  const goRoot = () => {
    hapticsBridge.selection();
    setView('root');
  };
  const drillTo = (next: ToolView) => () => {
    hapticsBridge.selection();
    setView(next);
  };
  const handleTips = () => {
    hapticsBridge.tap();
    onOpenTips();
  };

  return (
    <View style={[StyleSheet.absoluteFill, styles.layer]}>
      {/* Transparent backdrop — a tap anywhere off the panel closes the menu. */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onRequestClose}
        accessibilityRole="button"
        accessibilityLabel="Close camera tools"
      />

      <View
        // Claim touches on the panel's own padding/border so they don't fall
        // through to the backdrop and close the menu unexpectedly.
        onStartShouldSetResponder={() => true}
        style={[
          styles.panel,
          {
            width: panelWidth,
            top: topOffset,
            borderColor: theme.glassBorder,
          },
          leftOffset != null ? { left: leftOffset } : { right: rightOffset },
        ]}>
        <ScrollView
          style={{ maxHeight: maxBodyHeight }}
          contentContainerStyle={styles.body}
          showsVerticalScrollIndicator={false}>
          {view === 'root' ? (
            <>
              <View style={styles.cycleRow}>{cycleChips}</View>
              <View style={[styles.divider, { backgroundColor: theme.glassBorder }]} />
              <ToolRow
                icon="image-outline"
                label="Overlay"
                value={overlaySummary}
                themeColor={themeColor}
                onPress={drillTo('overlay')}
              />
              {exposureSummary != null ? (
                <ToolRow
                  icon="sunny-outline"
                  label="Exposure"
                  value={exposureSummary}
                  themeColor={themeColor}
                  onPress={drillTo('exposure')}
                />
              ) : null}
              <ToolRow
                icon="information-circle-outline"
                label="Framing tips"
                themeColor={themeColor}
                onPress={handleTips}
              />
            </>
          ) : null}

          {view === 'overlay' ? (
            <SubView title="Overlay" onBack={goRoot} dividerColor={theme.glassBorder}>
              {overlayControls}
            </SubView>
          ) : null}

          {view === 'exposure' ? (
            <SubView title="Exposure" onBack={goRoot} dividerColor={theme.glassBorder}>
              {exposureControls}
            </SubView>
          ) : null}
        </ScrollView>
      </View>
    </View>
  );
}

function ToolRow({
  icon,
  label,
  value,
  themeColor,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  /** Optional trailing summary. Omitted for plain action rows (e.g. tips). */
  value?: string;
  themeColor: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}, ${value}` : label}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}>
      <Ionicons name={icon} size={18} color="#fff" />
      <ThemedText variant="bodyMedium" weight="600" style={styles.rowLabel}>
        {label}
      </ThemedText>
      {value ? (
        <ThemedText variant="caption" weight="700" style={{ color: themeColor }}>
          {value}
        </ThemedText>
      ) : null}
      <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.5)" />
    </Pressable>
  );
}

function SubView({
  title,
  onBack,
  dividerColor,
  children,
}: {
  title: string;
  onBack: () => void;
  dividerColor: string;
  children: ReactNode;
}) {
  return (
    <>
      <Pressable
        onPress={onBack}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Back to camera tools"
        style={({ pressed }) => [styles.subHeader, pressed && { opacity: 0.7 }]}>
        <Ionicons name="chevron-back" size={20} color="#fff" />
        <ThemedText variant="titleSmall" weight="700" style={{ color: '#fff' }}>
          {title}
        </ThemedText>
      </Pressable>
      <View style={[styles.divider, { backgroundColor: dividerColor }]} />
      {children}
    </>
  );
}

const styles = StyleSheet.create({
  layer: { zIndex: 100 },
  // rgba scrim sits over the live camera preview — no theme surface below.
  // Near-opaque so the panel reads as a solid surface and the camera / anime
  // overlay can't bleed through behind the controls.
  panel: {
    position: 'absolute',
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.32,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  body: { padding: 12, gap: 10 },
  cycleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  divider: { height: StyleSheet.hairlineWidth },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  rowLabel: { flex: 1, color: '#fff' },
  subHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 36,
    marginLeft: -4,
  },
});
