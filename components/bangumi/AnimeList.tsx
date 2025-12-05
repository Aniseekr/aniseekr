import { View, Text, Pressable } from 'react-native';
import { GlassCard } from '../common/GlassCard';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Anime } from './WeeklyCalendar'; // types

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
    return (
        <GlassCard className="p-5 mb-5 rounded-[32px]" variant="dark" intensity={30} style={{ marginHorizontal: 0 }}>
            <View className="flex-row gap-5">
            <View className="w-24 h-36 bg-white/5 rounded-2xl border border-white/10" />
            <View className="flex-1 justify-center">
                <Text className="text-white text-lg font-bold mb-2 leading-6" numberOfLines={2}>
                {anime.title}
                </Text>
                {anime.broadcast?.string && (
                <View className="flex-row items-center gap-2 mb-3">
                    <Ionicons name="time-outline" size={14} color="#f97316" />
                    <Text className="text-orange-400 text-sm font-semibold tracking-wide">{anime.broadcast.string}</Text>
                </View>
                )}
                {anime.genres && anime.genres.length > 0 && (
                <View className="flex-row flex-wrap gap-2 mb-4">
                    {anime.genres.slice(0, 3).map((genre, idx) => (
                    <View key={idx} className="px-3 py-1.5 bg-white/5 rounded-full border border-white/5">
                        <Text className="text-white/60 text-[10px] font-bold uppercase tracking-wider">{genre.name}</Text>
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
    )
}
