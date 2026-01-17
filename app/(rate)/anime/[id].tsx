import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Image, Pressable, Platform, Dimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnimeRepository } from '../../../libs/repositories/anime-repository';
import { Anime } from '../../../components/rate/types';
import { GlassCard } from '../../../components/common/GlassCard';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';

export default function AnimeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [anime, setAnime] = useState<Anime | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      loadDetails();
    }
  }, [id]);

  const loadDetails = async () => {
    try {
      const data = await AnimeRepository.getAnimeDetails(id!);
      setAnime(data);
    } catch (e) {
      console.error("Failed to load details", e);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !anime) {
    return (
      <View className="flex-1 bg-black items-center justify-center">
        <Stack.Screen options={{ headerShown: false }} />
        <Text className="text-white">Loading...</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-black">
      <Stack.Screen options={{ headerShown: false }} />
      
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 100 }}>
        {/* Header - Banner */}
        <View className="relative w-full h-64">
          <Image
            source={{ uri: anime.bannerImage || anime.image }}
            className="w-full h-full object-cover opacity-60"
          />
          <LinearGradient
            colors={['transparent', '#000']}
            style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 150 }}
          />
          
          {/* Back Button */}
          <Pressable 
            onPress={() => router.back()} 
            style={{ top: insets.top + 10, left: 20 }}
            className="absolute z-10 w-10 h-10 rounded-full bg-black/40 items-center justify-center"
          >
            <Ionicons name="arrow-back" size={24} color="white" />
          </Pressable>
        </View>

        {/* Content - Overlapping Header */}
        <View className="px-5 -mt-20">
          <View className="flex-row items-end gap-4">
            {/* Cover Image */}
            <Image
              source={{ uri: anime.image }}
              className="w-28 h-40 rounded-lg border-2 border-white/10"
              style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 5 }}
            />
            {/* Title & Micro Info */}
            <View className="flex-1 pb-2">
              <Text className="text-white text-xl font-bold leading-tight mb-2" numberOfLines={2}>
                {anime.title}
              </Text>
              <View className="flex-row flex-wrap gap-2">
                 <GlassCard intensity={20} className="px-2 py-1 rounded">
                   <Text className="text-xs text-white/90 font-bold">
                     ★ {anime.rank ? (anime.rank / 10).toFixed(1) : 'N/A'}
                   </Text>
                 </GlassCard>
                 <GlassCard intensity={20} className="px-2 py-1 rounded">
                   <Text className="text-xs text-white/90 font-bold">{anime.status || 'Unknown'}</Text>
                 </GlassCard>
              </View>
            </View>
          </View>
          
          {/* Action Buttons */}
          <View className="flex-row gap-3 mt-6">
            <Pressable className="flex-1 bg-white rounded-full py-3 items-center flex-row justify-center gap-2">
              <Ionicons name="play" size={20} color="black" />
              <Text className="text-black font-bold text-base">Watch Now</Text>
            </Pressable>
            <Pressable className="w-12 h-12 bg-zinc-800 rounded-full items-center justify-center border border-white/10">
              <Ionicons name="add" size={24} color="white" />
            </Pressable>
            <Pressable className="w-12 h-12 bg-zinc-800 rounded-full items-center justify-center border border-white/10">
              <Ionicons name="share-outline" size={22} color="white" />
            </Pressable>
            {/* Rate Button */}
            <Pressable 
                onPress={() => router.push(`/(rate)/rating?animeId=${anime.id}`)}
                className="w-12 h-12 bg-zinc-800 rounded-full items-center justify-center border border-white/10"
            >
              <Ionicons name="flame-outline" size={22} color="#fbbf24" />
            </Pressable>
          </View>

          {/* Description */}
          <View className="mt-8">
             <Text className="text-white text-lg font-bold mb-3">Synopsis</Text>
             <Text className="text-zinc-400 leading-6">
               {anime.description || anime.mood || "No description available."}
             </Text>
          </View>

          {/* Tags */}
          <View className="mt-6">
            <Text className="text-white text-lg font-bold mb-3">Tags</Text>
            <View className="flex-row flex-wrap gap-2">
              {anime.tags?.map((tag) => (
                <View key={tag} className="bg-zinc-800 px-3 py-1.5 rounded-full border border-white/5">
                  <Text className="text-zinc-300 text-sm">{tag}</Text>
                </View>
              ))}
            </View>
          </View>
          
           {/* Detailed Info Grid */}
          <View className="mt-8 bg-zinc-900/50 rounded-2xl p-4 border border-white/5">
             <Text className="text-white text-lg font-bold mb-4">Information</Text>
             
             <View className="flex-row flex-wrap">
                <InfoItem label="Format" value={anime.format || "?"} />
                <InfoItem label="Episodes" value="12" /> 
                <InfoItem label="Duration" value={`${anime.durationMinutes || "?"} mins`} />
                <InfoItem label="Status" value={anime.status || "?"} />
                <InfoItem label="Start Date" value={anime.startDate ? `${anime.startDate.year}` : "?"} />
                <InfoItem label="Studios" value={anime.studios?.[0] || "?"} />
             </View>
          </View>

        </View>
      </ScrollView>
    </View>
  );
}

function InfoItem({ label, value }: { label: string, value: string }) {
  return (
    <View className="w-1/2 mb-4 pr-2">
       <Text className="text-zinc-500 text-xs font-medium mb-1">{label}</Text>
       <Text className="text-white text-sm font-semibold">{value}</Text>
    </View>
  );
}
