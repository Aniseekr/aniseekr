import { Image } from 'expo-image';
import { memo } from 'react';
import { Pressable, Text, View, StyleSheet, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Anime } from './types';
import { GlassCard } from '../common/GlassCard';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Colors, Radius, Spacing, Typography } from '../../constants/DesignSystem';

type Props = {
  anime: Anime;
  rank: number;
  onPress?: () => void;
};

function TrendCardComponent({ anime, rank, onPress }: Props) {
  const router = useRouter();

  const handlePress = () => {
    if (onPress) {
      onPress();
    } else {
      router.push({
        pathname: `/(rate)/anime/${anime.id}`,
      });
    }
  };

  // Rank styling
  const isTop3 = rank <= 3;
  const rankColor =
    rank === 1 ? '#FFD700' : rank === 2 ? '#C0C0C0' : rank === 3 ? '#CD7F32' : Colors.text.tertiary;

  return (
    <Pressable onPress={handlePress}>
      <GlassCard className="mb-3 flex-row items-center p-3" intensity={15}>
        {/* Rank Badge */}
        <View style={styles.rankContainer}>
          <Text
            style={[
              styles.rankText,
              { color: rankColor, fontSize: isTop3 ? 24 : 18, fontWeight: isTop3 ? '800' : '600' },
            ]}>
            #{rank}
          </Text>
          {isTop3 && (
            <Ionicons name="trophy" size={12} color={rankColor} style={{ marginTop: -2 }} />
          )}
        </View>

        {/* Cover Image */}
        <Image
          source={{ uri: anime.image }}
          style={styles.image}
          contentFit="cover"
          transition={200}
        />

        {/* Info */}
        <View style={styles.infoContainer}>
          <Text style={styles.title} numberOfLines={2}>
            {anime.title}
          </Text>

          <View style={styles.metaContainer}>
            <View style={styles.typeBadge}>
              <Text style={styles.typeText}>{anime.type || 'TV'}</Text>
            </View>
            {anime.score && (
              <View style={styles.scoreContainer}>
                <Ionicons name="star" size={10} color={Colors.warning} />
                <Text style={styles.scoreText}>{anime.score}</Text>
              </View>
            )}
          </View>

          <View style={styles.tagsContainer}>
            {anime.tags?.slice(0, 2).map((tag) => (
              <Text key={tag} style={styles.tagText}>
                #{tag}
              </Text>
            ))}
          </View>
        </View>

        {/* Arrow Hint */}
        <Ionicons name="chevron-forward" size={16} color={Colors.text.disabled} />
      </GlassCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  image: {
    width: 70,
    height: 100, // Standard poster ratio
    borderRadius: Radius.sm,
    backgroundColor: Colors.background.tertiary,
  },
  rankContainer: {
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.xs,
  },
  rankText: {
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
  },
  infoContainer: {
    flex: 1,
    marginLeft: Spacing.md,
    justifyContent: 'center',
  },
  title: {
    color: Colors.text.primary,
    ...Typography.titleMedium,
    marginBottom: Spacing.xxs,
  },
  metaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  typeBadge: {
    backgroundColor: Colors.glass.light,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  typeText: {
    color: Colors.text.secondary,
    fontSize: 10,
    fontWeight: '600',
  },
  scoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  scoreText: {
    color: Colors.warning,
    fontSize: 12,
    fontWeight: 'bold',
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tagText: {
    color: Colors.text.tertiary,
    fontSize: 11,
  },
});

export const TrendCard = memo(TrendCardComponent);
