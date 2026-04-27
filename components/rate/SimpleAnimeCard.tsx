import { Image } from 'expo-image';
import { memo } from 'react';
import { Pressable, Text, View, StyleSheet, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Anime } from './types';
import { Colors, Radius, Spacing, Typography } from '../../constants/DesignSystem';
import { NearbyPilgrimageBadge } from '../pilgrimage/NearbyPilgrimageBadge';

type Props = {
  anime: Anime;
  onPress?: () => void;
  width?: number;
  height?: number;
  /**
   * Optional Bangumi subject id. When supplied, a small location badge is
   * rendered in the top-right when pilgrimage data exists for this anime.
   */
  bangumiId?: number;
};

const DEFAULT_WIDTH = 140;
const DEFAULT_HEIGHT = 210;

function SimpleAnimeCardComponent({
  anime,
  onPress,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
  bangumiId,
}: Props) {
  return (
    <Pressable onPress={onPress} style={{ width, marginRight: Spacing.sm }}>
      <View style={[styles.cardContainer, { height }]}>
        <Image
          source={{ uri: anime.image }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={200}
          cachePolicy="memory-disk"
        />
        {/* Gradient overlay for text readability */}
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.8)']} style={styles.gradient} />
        {bangumiId !== undefined ? (
          <View style={styles.pilgrimageBadge}>
            <NearbyPilgrimageBadge bangumiId={bangumiId} variant="icon" />
          </View>
        ) : null}
        <View style={styles.textContainer}>
          <Text style={styles.title} numberOfLines={2}>
            {anime.title}
          </Text>
          {anime.score && <Text style={styles.score}>★ {anime.score}</Text>}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: Colors.background.secondary,
    position: 'relative',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  gradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '50%',
  },
  textContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: Spacing.xs,
  },
  title: {
    color: Colors.text.primary,
    ...Typography.bodySmall,
    fontWeight: '600',
    marginBottom: 4,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  score: {
    color: Colors.warning,
    fontSize: 11,
    fontWeight: 'bold',
  },
  pilgrimageBadge: {
    position: 'absolute',
    top: Spacing.xxs,
    right: Spacing.xxs,
  },
});

export const SimpleAnimeCard = memo(SimpleAnimeCardComponent);
