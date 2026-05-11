import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import {
  Colors,
  FontFamily,
  Radius,
  Spacing,
  Typography,
  IconSize,
} from '../../constants/DesignSystem';

interface OverviewStat {
  label: string;
  value: number;
  icon: keyof typeof MaterialIcons.glyphMap;
  color: string;
}

interface RecentThumb {
  id: string;
  imageUrl?: string;
}

interface CollectionOverviewCardProps {
  stats: OverviewStat[];
  recents?: RecentThumb[];
  onViewAll?: () => void;
  onRecentPress?: (id: string) => void;
}

export function CollectionOverviewCard({
  stats,
  recents = [],
  onViewAll,
  onRecentPress,
}: CollectionOverviewCardProps) {
  const showRecents = recents.length > 0;
  const total = stats.reduce((acc, s) => acc + (s.value || 0), 0);
  // First stat is typically "Total"; show the rest as compact tiles
  const tileStats = stats.length > 1 ? stats.slice(1) : stats;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.headerLabel}>OVERVIEW</Text>
        <View style={styles.totalGroup}>
          <Text style={styles.totalValue}>{total}</Text>
          <Text style={styles.totalLabel}>total</Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        {tileStats.map((stat) => (
          <View key={stat.label} style={styles.statTile}>
            <Text style={[styles.statValue, { color: stat.color }]}>{stat.value}</Text>
            <Text style={styles.statLabel}>{stat.label}</Text>
          </View>
        ))}
      </View>

      {showRecents ? (
        <View style={styles.recentsBlock}>
          <View style={styles.recentsHeader}>
            <Text style={styles.recentsTitle}>Recently added</Text>
            {onViewAll ? (
              <Pressable onPress={onViewAll} hitSlop={8}>
                <Text style={styles.viewAll}>See all</Text>
              </Pressable>
            ) : null}
          </View>
          <View style={styles.thumbRow}>
            {recents.slice(0, 3).map((item) => (
              <Pressable
                key={item.id}
                onPress={() => onRecentPress?.(item.id)}
                style={styles.thumb}>
                {item.imageUrl ? (
                  <Image
                    source={{ uri: item.imageUrl }}
                    style={styles.thumbImage}
                    contentFit="cover"
                  />
                ) : (
                  <View style={styles.thumbPlaceholder}>
                    <MaterialIcons name="image" size={IconSize.md} color={Colors.text.tertiary} />
                  </View>
                )}
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.xs,
    marginBottom: Spacing.sm,
    padding: Spacing.lg,
    backgroundColor: '#141414',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.glass.border,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  headerLabel: {
    ...Typography.titleSmall,
    color: Colors.text.secondary,
    letterSpacing: 1,
    fontWeight: '600',
  },
  totalGroup: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  totalValue: {
    color: Colors.text.primary,
    fontSize: 28,
    fontWeight: '800',
    fontFamily: FontFamily.rounded,
  },
  totalLabel: {
    color: Colors.text.secondary,
    fontSize: 12,
    fontWeight: '500',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statTile: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: Radius.md,
    backgroundColor: '#1A1A1A',
    alignItems: 'flex-start',
    gap: 2,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
    fontFamily: FontFamily.rounded,
    color: Colors.text.primary,
  },
  statLabel: {
    color: Colors.text.secondary,
    fontSize: 11,
    fontWeight: '500',
  },
  recentsBlock: {
    marginTop: Spacing.lg,
  },
  recentsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  recentsTitle: {
    ...Typography.titleMedium,
    color: Colors.text.primary,
    fontFamily: FontFamily.rounded,
  },
  viewAll: {
    ...Typography.bodySmall,
    color: Colors.text.secondary,
    fontWeight: '600',
  },
  thumbRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  thumb: {
    width: 90,
    height: 104,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: Colors.background.tertiary,
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  thumbPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
