// Inline badge shown on anime cards/list items when the anime has pilgrimage
// data. Loads lazily; renders nothing until data arrives. Optionally tappable
// — provide `onPress` to make it act as a shortcut into the pilgrimage detail.
//
// Spec: spec/pilgrimage_spec.md §7 (NearbyPilgrimageBadge).

import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useTheme, type ThemePalette } from '../../context/ThemeContext';
import { readableTextOn } from '../themed';
import { pilgrimageRepository } from '../../libs/services/pilgrimage/pilgrimage-repository';
import type { AnitabiBangumi } from '../../libs/services/pilgrimage/types';

export type NearbyPilgrimageBadgeVariant = 'icon' | 'pill';

interface BaseProps {
  variant?: NearbyPilgrimageBadgeVariant;
  /** Tap handler. Receives the resolved pilgrimage payload. */
  onPress?: (anime: AnitabiBangumi) => void;
}

interface ByBangumiId extends BaseProps {
  bangumiId: number;
  sourcePlatform?: never;
  id?: never;
}

interface ByPlatformId extends BaseProps {
  sourcePlatform: string;
  id: string | number;
  bangumiId?: never;
}

export type NearbyPilgrimageBadgeProps = ByBangumiId | ByPlatformId;

export function NearbyPilgrimageBadge(props: NearbyPilgrimageBadgeProps) {
  const { variant = 'pill', onPress } = props;
  const bangumiId = 'bangumiId' in props ? props.bangumiId : undefined;
  const sourcePlatform = 'sourcePlatform' in props ? props.sourcePlatform : undefined;
  const sourceId = 'id' in props ? props.id : undefined;
  const [data, setData] = useState<AnitabiBangumi | null>(null);
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  // The badge is filled with the accent — its label/icons must use the
  // contrast-safe foreground so they stay readable on light accents.
  const fg = readableTextOn(theme.accent);

  useEffect(() => {
    let cancelled = false;
    setData(null);

    const fetcher = bangumiId
      ? pilgrimageRepository.getSpotsByBangumiId(bangumiId)
      : pilgrimageRepository.getSpotsForAnime({
          sourcePlatform,
          id: sourceId,
        });

    fetcher
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        console.warn('[NearbyPilgrimageBadge] fetch failed:', err);
      });

    return () => {
      cancelled = true;
    };
  }, [bangumiId, sourcePlatform, sourceId]);

  if (!data) return null;

  const handlePress = () => {
    if (!onPress) return;
    Haptics.selectionAsync().catch(() => undefined);
    onPress(data);
  };

  if (variant === 'icon') {
    const Wrapper: typeof Pressable | typeof View = onPress ? Pressable : View;
    return (
      <Wrapper
        onPress={onPress ? handlePress : undefined}
        style={styles.iconBadge}
        testID="pilgrimage-badge-icon">
        <Ionicons name="location" size={12} color={fg} />
      </Wrapper>
    );
  }

  const Wrapper: typeof Pressable | typeof View = onPress ? Pressable : View;
  return (
    <Wrapper
      onPress={onPress ? handlePress : undefined}
      style={({ pressed }: { pressed?: boolean }) => [
        styles.pill,
        onPress && pressed ? styles.pillPressed : null,
      ]}
      testID="pilgrimage-badge-pill">
      <Ionicons name="location" size={12} color={fg} />
      <Text style={[styles.pillText, { color: fg }]} numberOfLines={1}>
        {data.city || `${data.pointsLength} spots`}
      </Text>
      {onPress ? <Ionicons name="chevron-forward" size={11} color={fg} /> : null}
    </Wrapper>
  );
}

function makeStyles(theme: ThemePalette) {
  return StyleSheet.create({
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: theme.accent,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
      alignSelf: 'flex-start',
    },
    pillPressed: {
      opacity: 0.75,
    },
    pillText: {
      fontSize: 11,
      fontWeight: '600',
    },
    iconBadge: {
      backgroundColor: theme.accent,
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
