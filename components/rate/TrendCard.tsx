import { Image } from "expo-image";
import { memo } from "react";
import { Pressable, Text, View, StyleSheet, Platform } from "react-native";
import { useRouter } from "expo-router";
import { Anime } from "./types";
import { GlassCard } from "../common/GlassCard";
import Ionicons from "@expo/vector-icons/Ionicons";

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
  const rankColor = rank === 1 ? '#FFD700' : rank === 2 ? '#C0C0C0' : rank === 3 ? '#CD7F32' : 'rgba(255,255,255,0.5)';

  return (
    <Pressable onPress={handlePress}>
      <GlassCard className="flex-row items-center p-3 mb-3" intensity={15}>
        {/* Rank Badge */}
        <View style={styles.rankContainer}>
             <Text style={[styles.rankText, { color: rankColor, fontSize: isTop3 ? 24 : 18, fontWeight: isTop3 ? '800' : '600' }]}>
                 #{rank}
             </Text>
             {isTop3 && <Ionicons name="trophy" size={12} color={rankColor} style={{ marginTop: -2 }} />}
        </View>

        {/* Cover Image */}
        <Image
          source={{ uri: anime.image }}
          style={styles.image}
          contentFit="cover"
          transition={200}
        />

        {/* Info */}
        <View className="flex-1 ml-4 justify-center">
          <Text className="text-white text-base font-bold mb-1" numberOfLines={2}>
            {anime.title}
          </Text>
          
          <View className="flex-row items-center gap-2 mb-2">
             <View className="bg-white/10 px-2 py-0.5 rounded-md">
                <Text className="text-white/70 text-xs font-medium">{anime.type || 'TV'}</Text>
             </View>
             {anime.score && (
                 <View className="flex-row items-center gap-1">
                     <Ionicons name="star" size={10} color="#fbbf24" />
                     <Text className="text-amber-400 text-xs font-bold">{anime.score}</Text>
                 </View>
             )}
          </View>

          <View className="flex-row flex-wrap gap-1.5">
            {anime.tags?.slice(0, 2).map((tag) => (
              <Text key={tag} className="text-white/50 text-xs">
                #{tag}
              </Text>
            ))}
          </View>
        </View>
        
        {/* Arrow Hint */}
        <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.3)" />
      </GlassCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
    image: {
        width: 70,
        height: 100, // Standard poster ratio
        borderRadius: 8,
        backgroundColor: '#2a2a2a'
    },
    rankContainer: {
        width: 40,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 8,
    },
    rankText: {
        fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
    }
});

export const TrendCard = memo(TrendCardComponent);

