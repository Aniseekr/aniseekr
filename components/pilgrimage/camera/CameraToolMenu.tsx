import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ThemedText } from '../../themed';
import { useTheme } from '../../../context/ThemeContext';
import { hapticsBridge } from '../../../modules/haptics/hapticsBridge';
import {
  CAMERA_TOOL_MENU_MIN_PANEL_WIDTH,
  CAMERA_TOOL_MENU_PANEL_WIDTH,
} from '../../../libs/services/pilgrimage/camera-ui';

/** Which secondary tool the popover is currently showing. */
export type CameraTool = 'overlay' | 'exposure' | 'more';

interface CameraToolMenuProps {
  /** Active tool, or `null` to render nothing. Each tool has its own top-bar trigger. */
  tool: CameraTool | null;
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
  /** Quick-cycle chips (self-timer / aspect / orientation) for the `more` view. */
  cycleChips: ReactNode;
  /** Overlay tool body. */
  overlayControls: ReactNode;
  /** Exposure tool body. */
  exposureControls: ReactNode;
  /** Opens the framing-tips / alignment screen — listed in the `more` view. */
  onOpenTips: () => void;
}

const TITLE: Record<CameraTool, string> = {
  overlay: 'Overlay',
  exposure: 'Exposure',
  more: 'More',
};

// Header (title + close) sits above the scrolling body — reserve its height
// so the body cap leaves room for it and never runs past the chrome.
const PANEL_HEADER_HEIGHT = 48;

/**
 * The camera tool popover. Each secondary tool — overlay / exposure / more —
 * has its own top-bar trigger; this single panel drops DOWN from that bar and
 * shows just the active tool's controls.
 *
 * One panel, one tool: no drill-down, no stacked pop-outs, so nothing ever
 * floats on top of anything else and there is no overlap to clip or
 * mis-position. It sits at screen root so it floats above every camera HUD
 * layer and is reliably touchable.
 */
export default function CameraToolMenu({
  tool,
  onRequestClose,
  themeColor,
  topOffset,
  leftOffset,
  rightOffset,
  bottomReserve,
  cycleChips,
  overlayControls,
  exposureControls,
  onOpenTips,
}: CameraToolMenuProps) {
  const { theme } = useTheme();
  const { width: winW, height: winH } = useWindowDimensions();

  if (!tool) return null;

  // Clamp width so the panel always keeps a ≥16px margin on both screen edges.
  const panelWidth = Math.max(
    CAMERA_TOOL_MENU_MIN_PANEL_WIDTH,
    Math.min(CAMERA_TOOL_MENU_PANEL_WIDTH, winW - 32)
  );
  // The panel hangs off the top bar; cap the body so it never runs into the
  // fixed bottom bar — it scrolls instead (matters in short landscape windows).
  const maxBodyHeight = Math.max(
    160,
    winH - topOffset - bottomReserve - PANEL_HEADER_HEIGHT - 16
  );

  const handleTips = () => {
    hapticsBridge.tap();
    onOpenTips();
  };

  return (
    <View style={[StyleSheet.absoluteFill, styles.layer]}>
      {/* Transparent backdrop — a tap anywhere off the panel closes the popover. */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onRequestClose}
        accessibilityRole="button"
        accessibilityLabel="Close camera tools"
      />

      <View
        // Claim touches on the panel's own padding/border so they don't fall
        // through to the backdrop and close the popover unexpectedly.
        onStartShouldSetResponder={() => true}
        style={[
          styles.panel,
          { width: panelWidth, top: topOffset, borderColor: theme.glassBorder },
          leftOffset != null ? { left: leftOffset } : { right: rightOffset },
        ]}>
        <View style={styles.header}>
          <ThemedText variant="titleSmall" weight="700" style={styles.headerTitle}>
            {TITLE[tool]}
          </ThemedText>
          <Pressable
            onPress={onRequestClose}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Close camera tools"
            style={({ pressed }) => [styles.headerClose, pressed && { opacity: 0.6 }]}>
            <Ionicons name="close" size={18} color="#fff" />
          </Pressable>
        </View>
        <View style={[styles.divider, { backgroundColor: theme.glassBorder }]} />

        <ScrollView
          style={{ maxHeight: maxBodyHeight }}
          contentContainerStyle={styles.body}
          showsVerticalScrollIndicator={false}>
          {tool === 'overlay' ? overlayControls : null}
          {tool === 'exposure' ? exposureControls : null}
          {tool === 'more' ? (
            <>
              <View style={styles.cycleRow}>{cycleChips}</View>
              <View style={[styles.divider, { backgroundColor: theme.glassBorder }]} />
              <ToolRow
                icon="information-circle-outline"
                label="Framing tips"
                themeColor={themeColor}
                onPress={handleTips}
              />
            </>
          ) : null}
        </ScrollView>
      </View>
    </View>
  );
}

function ToolRow({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  themeColor: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}>
      <Ionicons name={icon} size={18} color="#fff" />
      <ThemedText variant="bodyMedium" weight="600" style={styles.rowLabel}>
        {label}
      </ThemedText>
      <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.5)" />
    </Pressable>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: PANEL_HEADER_HEIGHT,
    paddingLeft: 14,
    paddingRight: 8,
  },
  headerTitle: { flex: 1, color: '#fff' },
  headerClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
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
});
