import { View, Text, Pressable, Image } from 'react-native';
import { GlassCard } from '../common/GlassCard';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Anime } from '../rate/types';
import { useRouter } from 'expo-router';

interface AnimeListProps {
  listViewData: { day: string; anime: Anime[] }[];
  renderAnimeCard: (anime: Anime) => React.ReactNode;
}

export function AnimeList({ listViewData, renderAnimeCard }: AnimeListProps) {
  return (
    <View className="px-5">
      {listViewData.map((group) => (
        <View key={group.day} className="mb-8">
          <Text className="text-white text-2xl font-bold mb-4 pl-2 tracking-tight">{group.day}</Text>
          {group.anime.map((anime) => renderAnimeCard(anime))}
        </View>
      ))}
    </View>
  );
}

export function AnimeRowCard({ anime }: { anime: Anime }) {
    const router = useRouter();
    return (
        <Pressable onPress={() => router.push(`/(rate)/anime/${anime.id}`)}>
            <GlassCard className="p-5 mb-5 rounded-[32px]" variant="dark" intensity={30} style={{ marginHorizontal: 0 }}>
                <View className="flex-row gap-5">
                <Image source={{ uri: anime.image }} className="w-24 h-36 rounded-2xl border border-white/10" resizeMode="cover" />
                <View className="flex-1 justify-center">
                    <Text className="text-white text-lg font-bold mb-2 leading-6" numberOfLines={2}>
                    {anime.title}
                    </Text>
                    
                    {anime.tags && anime.tags.length > 0 && (
                    <View className="flex-row flex-wrap gap-2 mb-4">
                        {anime.tags.slice(0, 3).map((tag, idx) => (
                        <View key={idx} className="px-3 py-1.5 bg-white/5 rounded-full border border-white/5">
                            <Text className="text-white/60 text-[10px] font-bold uppercase tracking-wider">{tag}</Text>
                        </View>
                        ))}
                    </View>
                    )}
                    <Pressable className="self-start px-5 py-2.5 bg-white text-black rounded-full active:opacity-80">
                    <Text className="text-black text-xs font-bold uppercase tracking-widest">Remind Me</Text>
                    </Pressable>
                </View>
                </View>
            </GlassCard>
        </Pressable>
    )
}
