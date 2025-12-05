import { Image } from "expo-image";
import { memo } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Anime } from "./types";
import { GlassCard } from "../common/GlassCard";

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

  return (
    <Pressable onPress={handlePress}>
      <GlassCard className="flex-row items-center p-4">
        <Text className="text-white text-xl font-bold w-10 text-center">#{rank}</Text>
        <Image
          source={{ uri: anime.image }}
          style={{ width: 80, height: 112 }}
          className="rounded-2xl bg-black/20"
          contentFit="cover"
          transition={120}
        />
        <View className="flex-1 ml-3">
          <Text className="text-white text-base font-semibold" numberOfLines={2}>
            {anime.title}
          </Text>
          <View className="flex-row flex-wrap gap-2 mt-2">
            {anime.tags?.slice(0, 3).map((tag) => (
              <View key={tag} className="px-2 py-1 rounded-full bg-white/10">
                <Text className="text-white/80 text-xs">{tag}</Text>
              </View>
            ))}
          </View>
        </View>
      </GlassCard>
    </Pressable>
  );
}

export const TrendCard = memo(TrendCardComponent);

