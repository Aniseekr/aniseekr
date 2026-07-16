import Ionicons from '@expo/vector-icons/Ionicons';
import { memo, useCallback, useMemo, useState, type ComponentProps } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { IconSize, Radius, Spacing } from '../../../constants/DesignSystem';
import { useTheme } from '../../../context/ThemeContext';
import { useT } from '../../../libs/i18n';
import type { StreetViewResult } from '../../../libs/services/pilgrimage/street-view/street-view-service';
import { hapticsBridge } from '../../../modules/haptics/hapticsBridge';
import { LookAroundPreviewView } from '../../../modules/lookaround/src/LookAroundPreviewView';
import { Skeleton, ThemedSurface, ThemedText } from '../../themed';
import { MapillaryKenBurnsCard } from './MapillaryKenBurnsCard';

export interface StreetViewCardProps {
  status: 'idle' | 'resolving' | 'ready';
  result: StreetViewResult | null;
  /**
   * Invoked when the Look Around preview can't actually load its scene
   * (stale cached availability). The owner corrects the cache and re-resolves
   * to Mapillary; without a handler the section just collapses.
   */
  onLookAroundUnavailable?: () => void;
  style?: StyleProp<ViewStyle>;
}

function StreetViewCardComponent({
  status,
  result,
  onLookAroundUnavailable,
  style,
}: StreetViewCardProps) {
  const { theme } = useTheme();
  const t = useT();
  const styles = useMemo(() => makeStyles(), []);
  const resultKey = useMemo(() => {
    if (!result) return 'none';
    const imageId = result.kind === 'mapillary' ? (result.images[0]?.id ?? 'empty') : 'lookaround';
    return `${result.kind}:${result.latitude}:${result.longitude}:${imageId}`;
  }, [result]);
  const [collapsedKey, setCollapsedKey] = useState<string | null>(null);
  const collapsed = collapsedKey === resultKey;

  const collapse = useCallback(() => {
    setCollapsedKey(resultKey);
  }, [resultKey]);

  const handleLookAroundPress = useCallback(() => {
    if (!result || result.kind !== 'lookaround') return;
    hapticsBridge.tap();
    import('../../../modules/lookaround/src')
      .then((module) => module.present(result.latitude, result.longitude))
      .catch(() => {
        collapse();
      });
  }, [collapse, result]);

  if (collapsed || status === 'idle' || (status === 'ready' && !result)) return null;

  if (status === 'resolving') {
    return (
      <View style={[styles.section, style]}>
        <SectionHeader title={t('pilgrimage.streetView.title')} />
        <ThemedSurface variant="card" radius={Radius.lg} style={styles.skeletonCard}>
          <Skeleton.Block width="100%" height="100%" borderRadius={Radius.lg} intensity="low" />
          <ThemedText
            variant="caption"
            tone="secondary"
            weight="700"
            numberOfLines={1}
            style={styles.loadingLabel}>
            {t('pilgrimage.streetView.loading')}
          </ThemedText>
        </ThemedSurface>
      </View>
    );
  }

  if (!result) return null;

  return (
    <View style={[styles.section, style]}>
      <SectionHeader title={t('pilgrimage.streetView.title')} />
      {result.kind === 'lookaround' ? (
        <Pressable
          onPress={handleLookAroundPress}
          accessibilityRole="button"
          accessibilityLabel={t('pilgrimage.streetView.openLookAround')}
          style={({ pressed }) => [
            styles.lookAroundCard,
            {
              backgroundColor: theme.background.tertiary,
              borderColor: theme.glassBorder,
            },
            pressed && styles.pressed,
          ]}>
          <LookAroundPreviewView
            latitude={result.latitude}
            longitude={result.longitude}
            onSceneUnavailable={onLookAroundUnavailable ?? collapse}
            style={styles.lookAroundPreview}
          />
          <View
            style={[
              styles.lookAroundPill,
              {
                backgroundColor: theme.background.secondary,
                borderColor: theme.glassBorder,
              },
            ]}>
            <Ionicons name="expand-outline" size={IconSize.sm} color={theme.text.secondary} />
            <ThemedText variant="captionSmall" tone="secondary" weight="700" numberOfLines={1}>
              {t('pilgrimage.streetView.openLookAround')}
            </ThemedText>
          </View>
        </Pressable>
      ) : (
        <MapillaryKenBurnsCard result={result} onUnavailable={collapse} />
      )}
    </View>
  );
}

function SectionHeader({ title }: { title: string }) {
  const { theme } = useTheme();
  return (
    <View style={headerStyles.row}>
      <Ionicons name="navigate-circle-outline" size={IconSize.sm} color={theme.text.tertiary} />
      <ThemedText variant="titleSmall" tone="secondary" weight="800">
        {title}
      </ThemedText>
    </View>
  );
}

export const StreetViewCard = memo(StreetViewCardComponent);

const headerStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
});

function makeStyles() {
  return StyleSheet.create({
    section: {
      marginBottom: Spacing.md,
    },
    skeletonCard: {
      height: 116,
      justifyContent: 'flex-end',
    },
    loadingLabel: {
      position: 'absolute',
      left: Spacing.md,
      bottom: Spacing.md,
      right: Spacing.md,
    },
    lookAroundCard: {
      minHeight: 148,
      borderRadius: Radius.lg,
      borderWidth: 1,
      overflow: 'hidden',
    },
    lookAroundPreview: {
      height: 148,
      width: '100%',
    } satisfies ComponentProps<typeof LookAroundPreviewView>['style'],
    lookAroundPill: {
      position: 'absolute',
      left: Spacing.xs,
      bottom: Spacing.xs,
      minHeight: IconSize.md,
      maxWidth: '72%',
      borderRadius: Radius.full,
      borderWidth: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.xxs,
      paddingHorizontal: Spacing.xs,
    },
    pressed: {
      opacity: 0.86,
    },
  });
}
