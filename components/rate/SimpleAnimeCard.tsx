import { Image } from "expo-image";
import { memo } from "react";
import { Pressable, Text, View, StyleSheet, Platform, Dimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Anime } from "./types";

type Props = {
  anime: Anime;
  onPress?: () => void;
  width?: number;
  height?: number;
};

const DEFAULT_WIDTH = 140;
const DEFAULT_HEIGHT = 210;

function SimpleAnimeCardComponent({ anime, onPress, width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT }: Props) {
  return (
    <Pressable 
      onPress={onPress} 
      style={{ width, marginRight: 12 }}
    >
      <View style={[styles.cardContainer, { height }]}>
        <Image
          source={{ uri: anime.image }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={200}
          cachePolicy="memory-disk"
        />
         {/* Gradient overlay for text readability */}
        <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.8)']}
            style={styles.gradient}
        />
        <View style={styles.textContainer}>
            <Text style={styles.title} numberOfLines={2}>
                {anime.title}
            </Text>
            {anime.score && (
                <Text style={styles.score}>★ {anime.score}</Text>
            )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
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
      padding: 8,
  },
  title: {
      color: '#fff',
      fontSize: 13,
      fontWeight: '600',
      marginBottom: 4,
      textShadowColor: 'rgba(0,0,0,0.5)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 2,
  },
  score: {
      color: '#fbbf24', // Amber-400
      fontSize: 11,
      fontWeight: 'bold',
  }
});

export const SimpleAnimeCard = memo(SimpleAnimeCardComponent);
