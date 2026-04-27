// Inline badge shown on UnifiedAnimeItem cards when the anime has pilgrimage
// data. Loads lazily; renders nothing until data arrives.
//
// Spec: spec/pilgrimage_spec.md §7 (NearbyPilgrimageBadge).

import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { pilgrimageRepository } from '../../libs/services/pilgrimage/pilgrimage-repository';
import type { AnitabiBangumi } from '../../libs/services/pilgrimage/types';

export type NearbyPilgrimageBadgeVariant = 'icon' | 'pill';

export interface NearbyPilgrimageBadgeProps {
  bangumiId: number;
  variant?: NearbyPilgrimageBadgeVariant;
}

export function NearbyPilgrimageBadge({
  bangumiId,
  variant = 'pill',
}: NearbyPilgrimageBadgeProps) {
  const [data, setData] = useState<AnitabiBangumi | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);

    pilgrimageRepository
      .getSpotsByBangumiId(bangumiId)
      .then((result) => {
        if (cancelled) return;
        setData(result);
      })
      .catch((err) => {
        // Swallow — a fetch failure should never break the host card.
        // eslint-disable-next-line no-console
        console.warn('[NearbyPilgrimageBadge] fetch failed:', err);
      });

    return () => {
      cancelled = true;
    };
  }, [bangumiId]);

  if (!data) return null;

  if (variant === 'icon') {
    return (
      <View style={styles.iconBadge} testID="pilgrimage-badge-icon">
        <Ionicons name="location" size={12} color="#FFFFFF" />
      </View>
    );
  }

  return (
    <View style={styles.pill} testID="pilgrimage-badge-pill">
      <Ionicons name="location" size={12} color="#FFFFFF" />
      <Text style={styles.pillText} numberOfLines={1}>
        {data.city || `${data.pointsLength} spots`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(141, 197, 216, 0.85)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  pillText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
  iconBadge: {
    backgroundColor: 'rgba(141, 197, 216, 0.85)',
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
