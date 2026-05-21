// Camera diagnostics screen. Always available (not gated on __DEV__) so a
// real-world user who hits a "0.5× is missing on my dial" bug can tap
// Settings → Advanced → Camera diagnostics → Share and paste the JSON into
// a bug report. The dump includes:
//
//   1. Device identity (manufacturer, model, Android/iOS version) — the
//      cache key for the cohort fingerprint, and what we'd ask for first
//      in any bug repro.
//   2. Every camera VisionCamera enumerates, with the same fields the
//      cohort classifier reads. If our `type === 'ultra-wide-angle'`
//      assumption holds, you'll see one back device tagged ultra-wide here;
//      if it doesn't, the dump tells us why classifyCohort returned
//      `wide-only` on hardware that obviously has an ultra-wide lens.
//   3. The computed cohort + strategy — what the dial will actually do
//      with the device list above.
//
// Per CLAUDE.md Rule 8 the dump shows only fields VisionCamera reports as
// of the moment the screen renders. No estimates, no synthesised values.
import { useCallback, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Application from 'expo-application';
import { Stack, router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useCameraDevices, type CameraDevice } from 'react-native-vision-camera';
import { Radius, Size, Spacing } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import {
  ThemedSurface,
  ThemedText,
  readableTextOn,
} from '../../components/themed';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import {
  classifyCohort,
  type DeviceCohort,
} from '../../libs/services/pilgrimage/device-cohort';

interface CameraDump {
  id: string;
  type: string | undefined;
  position: string;
  isVirtualDevice: boolean;
  minZoom: number;
  maxZoom: number;
  focalLength: number | undefined;
  hasTorch: boolean;
  supportsPhotoHDR: boolean;
  manufacturer: string;
  modelID: string;
  physicalDevices: Array<{ id: string; type: string | undefined; focalLength: number | undefined }>;
  zoomLensSwitchFactors: number[];
}

interface DiagnosticsPayload {
  generatedAt: string;
  identity: {
    osPlatform: string;
    osVersion: string;
    manufacturer: string;
    model: string;
    appBuildNumber: string;
    appVersion: string;
  };
  totalDeviceCount: number;
  devices: CameraDump[];
  cohort: {
    strategy: DeviceCohort['strategy'] | null;
    primaryId: string | null;
    ultraWideId: string | null;
    telephotoId: string | null;
  };
}

function dumpDevice(device: CameraDevice): CameraDump {
  return {
    id: device.id,
    type: device.type,
    position: device.position,
    isVirtualDevice: device.isVirtualDevice,
    minZoom: device.minZoom,
    maxZoom: device.maxZoom,
    focalLength: device.focalLength,
    hasTorch: device.hasTorch,
    supportsPhotoHDR: device.supportsPhotoHDR,
    manufacturer: device.manufacturer,
    modelID: device.modelID,
    physicalDevices: device.physicalDevices.map((child) => ({
      id: child.id,
      type: child.type,
      focalLength: child.focalLength,
    })),
    zoomLensSwitchFactors: [...device.zoomLensSwitchFactors],
  };
}

function platformIdentity(): DiagnosticsPayload['identity'] {
  const constants = Platform.constants as unknown as {
    Manufacturer?: string;
    Model?: string;
    Release?: string;
    osVersion?: string;
  };
  return {
    osPlatform: Platform.OS,
    osVersion: String(Platform.Version),
    manufacturer:
      Platform.OS === 'android' ? constants.Manufacturer ?? 'unknown' : 'apple',
    model:
      Platform.OS === 'android' ? constants.Model ?? 'unknown' : 'ios',
    appBuildNumber: Application.nativeBuildVersion ?? 'unknown',
    appVersion: Application.nativeApplicationVersion ?? 'unknown',
  };
}

export default function CameraDiagnosticsScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const devices = useCameraDevices();
  const [refreshTick, setRefreshTick] = useState(0);

  const payload = useMemo<DiagnosticsPayload>(() => {
    const cohort = classifyCohort(devices);
    return {
      generatedAt: new Date().toISOString(),
      identity: platformIdentity(),
      totalDeviceCount: devices.length,
      devices: devices.map(dumpDevice),
      cohort: {
        strategy: cohort?.strategy ?? null,
        primaryId: cohort?.primary.id ?? null,
        ultraWideId: cohort?.ultraWide?.id ?? null,
        telephotoId: cohort?.telephoto?.id ?? null,
      },
    };
    // refreshTick rebuilds the snapshot even when devices itself is reference-
    // stable across renders — useful when the user wants a fresh capture
    // without leaving the screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devices, refreshTick]);

  const jsonText = useMemo(() => JSON.stringify(payload, null, 2), [payload]);

  const handleShare = useCallback(() => {
    hapticsBridge.tap();
    Share.share({
      title: 'Aniseekr camera diagnostics',
      message: jsonText,
    }).catch(() => undefined);
  }, [jsonText]);

  const handleRefresh = useCallback(() => {
    hapticsBridge.selection();
    setRefreshTick((t) => t + 1);
  }, []);

  return (
    <View style={[styles.root, { backgroundColor: theme.background.primary }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={[styles.header, { paddingTop: insets.top > 0 ? 0 : Spacing.sm }]}>
          <Pressable
            onPress={() => {
              hapticsBridge.tap();
              router.back();
            }}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={({ pressed }) => [
              styles.iconButton,
              {
                backgroundColor: theme.background.secondary,
                borderColor: theme.glassBorder,
                opacity: pressed ? 0.7 : 1,
              },
            ]}>
            <Ionicons name="arrow-back" size={20} color={theme.text.primary} />
          </Pressable>
          <View style={styles.headerTitleWrap}>
            <ThemedText variant="titleLarge" weight="700">
              Camera diagnostics
            </ThemedText>
            <ThemedText variant="bodySmall" tone="secondary">
              Hardware fingerprint + cohort classification
            </ThemedText>
          </View>
          <Pressable
            onPress={handleRefresh}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Refresh device snapshot"
            style={({ pressed }) => [
              styles.iconButton,
              {
                backgroundColor: theme.background.secondary,
                borderColor: theme.glassBorder,
                opacity: pressed ? 0.7 : 1,
              },
            ]}>
            <Ionicons name="refresh" size={20} color={theme.text.primary} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + Spacing.xl * 2 },
          ]}
          showsVerticalScrollIndicator={false}>
          <Section title="Identity">
            <Row label="Manufacturer / Model" value={`${payload.identity.manufacturer} / ${payload.identity.model}`} />
            <Row label="OS" value={`${payload.identity.osPlatform} ${payload.identity.osVersion}`} />
            <Row label="App version" value={`${payload.identity.appVersion} (${payload.identity.appBuildNumber})`} />
            <Row label="Snapshot taken" value={payload.generatedAt} />
          </Section>

          <Section title="Cohort classification">
            <Row label="Strategy" value={payload.cohort.strategy ?? '(null — no back devices)'} />
            <Row label="Primary" value={payload.cohort.primaryId ?? '(none)'} />
            <Row label="Ultra-wide" value={payload.cohort.ultraWideId ?? '(none — no 0.5× swap target)'} />
            <Row label="Telephoto" value={payload.cohort.telephotoId ?? '(none)'} />
          </Section>

          <Section title={`Cameras (${payload.totalDeviceCount})`}>
            {payload.devices.length === 0 ? (
              <ThemedText variant="bodySmall" tone="secondary" style={styles.empty}>
                No camera devices reported. Permission may still be pending — back
                out and re-open this screen.
              </ThemedText>
            ) : (
              payload.devices.map((device, index) => (
                <DeviceCard key={device.id || `idx-${index}`} device={device} />
              ))
            )}
          </Section>

          <Pressable
            onPress={handleShare}
            accessibilityRole="button"
            accessibilityLabel="Share diagnostics JSON"
            style={({ pressed }) => [
              styles.shareButton,
              {
                backgroundColor: theme.accent,
                opacity: pressed ? 0.85 : 1,
              },
            ]}>
            <Ionicons
              name="share-outline"
              size={18}
              color={readableTextOn(theme.accent)}
            />
            <ThemedText
              variant="titleMedium"
              weight="700"
              style={{ color: readableTextOn(theme.accent) }}>
              Share diagnostics
            </ThemedText>
          </Pressable>

          <ThemedText
            variant="captionSmall"
            tone="secondary"
            style={styles.footnote}>
            Paste the shared JSON into a bug report. The dump contains no
            personal data — only hardware capabilities reported by your OS.
          </ThemedText>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { theme } = useTheme();
  return (
    <View style={styles.section}>
      <ThemedText
        variant="captionSmall"
        tone="secondary"
        weight="600"
        style={styles.sectionTitle}>
        {title.toUpperCase()}
      </ThemedText>
      <ThemedSurface variant="card" padded={false} style={styles.sectionCard}>
        {children}
      </ThemedSurface>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.row, { borderBottomColor: theme.glassBorder }]}>
      <ThemedText variant="bodySmall" tone="secondary" style={styles.rowLabel}>
        {label}
      </ThemedText>
      <ThemedText variant="bodyMedium" style={styles.rowValue} numberOfLines={2}>
        {value}
      </ThemedText>
    </View>
  );
}

function DeviceCard({ device }: { device: CameraDump }) {
  const { theme } = useTheme();
  const isUltraWide = device.type === 'ultra-wide-angle';
  return (
    <View style={[styles.deviceCard, { borderBottomColor: theme.glassBorder }]}>
      <View style={styles.deviceCardHeader}>
        <ThemedText variant="titleSmall" weight="700">
          id: {device.id}
        </ThemedText>
        {isUltraWide ? (
          <View style={[styles.tag, { backgroundColor: theme.accent }]}>
            <ThemedText
              variant="captionSmall"
              weight="800"
              style={{ color: readableTextOn(theme.accent) }}>
              ULTRA-WIDE
            </ThemedText>
          </View>
        ) : null}
      </View>
      <Row label="type" value={device.type ?? '(undefined)'} />
      <Row label="position" value={device.position} />
      <Row label="isVirtualDevice" value={String(device.isVirtualDevice)} />
      <Row label="minZoom / maxZoom" value={`${device.minZoom} / ${device.maxZoom}`} />
      <Row
        label="focalLength (35mm-equiv)"
        value={device.focalLength === undefined ? '(undefined)' : String(device.focalLength)}
      />
      <Row
        label="zoomLensSwitchFactors"
        value={device.zoomLensSwitchFactors.length > 0 ? device.zoomLensSwitchFactors.join(', ') : '[]'}
      />
      <Row
        label="physicalDevices"
        value={
          device.physicalDevices.length === 0
            ? '[]'
            : device.physicalDevices
                .map((c) => `${c.type ?? '?'}@${c.focalLength ?? '?'}mm`)
                .join(', ')
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  iconButton: {
    width: Size.minTouchTarget,
    height: Size.minTouchTarget,
    borderRadius: Size.minTouchTarget / 2,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: { flex: 1 },
  content: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    gap: Spacing.lg,
  },
  section: { gap: Spacing.xs },
  sectionTitle: {
    paddingHorizontal: Spacing.sm,
    letterSpacing: 1,
  },
  sectionCard: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLabel: { flex: 0, minWidth: 140 },
  rowValue: { flex: 1, textAlign: 'right' },
  deviceCard: {
    padding: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing.xs,
  },
  deviceCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  tag: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    height: Size.minTouchTarget + 8,
    borderRadius: Radius.lg,
    marginTop: Spacing.md,
  },
  empty: {
    padding: Spacing.lg,
    textAlign: 'center',
  },
  footnote: {
    paddingHorizontal: Spacing.sm,
    paddingTop: Spacing.sm,
    textAlign: 'center',
  },
});
