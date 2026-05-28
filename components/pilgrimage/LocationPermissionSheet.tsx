// LocationPermissionSheet — surfaced once per session when the OS reports
// `canAskAgain === false` (iOS denied; Android "Don't ask again"). Re-prompting
// the OS at that point is a no-op, so we explain why we need location and
// route the user to system settings.
//
// Companion to `useUserLocationTracking` — the hook owns the visibility flag,
// this component owns the visual presentation.
//
// Native iOS / Android modal is intentional rather than gorhom — this is a
// short, modal interaction tied to a specific tap, not a piece of map chrome
// that competes with the existing pilgrimage sheets.

import { memo } from 'react';
import { Modal, Pressable, StyleSheet, View, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../context/ThemeContext';
import { Radius, Spacing } from '../../constants/DesignSystem';
import { ThemedButton, ThemedSurface, ThemedText } from '../themed';

export interface LocationPermissionSheetProps {
  visible: boolean;
  onDismiss: () => void;
}

function LocationPermissionSheetComponent({ visible, onDismiss }: LocationPermissionSheetProps) {
  const { theme } = useTheme();

  const handleOpenSettings = () => {
    Linking.openSettings().catch(() => undefined);
    onDismiss();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
      statusBarTranslucent>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} accessibilityLabel="Dismiss" />
        <View style={styles.sheetWrap} pointerEvents="box-none">
          <ThemedSurface variant="elevated" padded style={styles.sheet}>
            <SafeAreaView edges={['bottom']}>
              <View style={[styles.iconBubble, { backgroundColor: `${theme.accent}22` }]}>
                <Ionicons name="location" size={22} color={theme.accent} />
              </View>
              <ThemedText variant="titleMedium" weight="700" align="center" style={styles.title}>
                Location is off
              </ThemedText>
              <ThemedText variant="bodyMedium" tone="secondary" align="center" style={styles.body}>
                Turn on location for AniSeekr in Settings to see where you are on the pilgrimage map.
              </ThemedText>
              <View style={styles.actions}>
                <ThemedButton
                  label="Open Settings"
                  onPress={handleOpenSettings}
                  size="lg"
                  fullWidth
                />
                <ThemedButton
                  label="Not now"
                  onPress={onDismiss}
                  size="lg"
                  fullWidth
                  variant="ghost"
                />
              </View>
            </SafeAreaView>
          </ThemedSurface>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheetWrap: {
    width: '100%',
  },
  sheet: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  iconBubble: {
    alignSelf: 'center',
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  title: {
    marginBottom: Spacing.xs,
  },
  body: {
    marginBottom: Spacing.lg,
  },
  actions: {
    gap: Spacing.xs,
  },
});

export const LocationPermissionSheet = memo(LocationPermissionSheetComponent);
