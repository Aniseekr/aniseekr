import { View, Text, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { GlassCard } from '../common/GlassCard';

export interface Anime {
  id: number;
  title: string;
  images: {
    jpg: {
      imageUrl?: string;
      largeImageUrl?: string;
    };
  };
  broadcast?: {
    day?: string;
    time?: string;
    string?: string;
  };
  genres?: Array<{ name: string }>;
  score?: number;
}

interface WeeklyCalendarProps {
    weekDays: string[];
    groupedAnime: any[]; // Using any for simplicity as types are shared, ideally would allow shared types
    isCurrentDay: (day: string) => boolean;
    dayShortName: (day: string) => string;
}

export function WeeklyCalendar({ weekDays, groupedAnime, isCurrentDay, dayShortName }: WeeklyCalendarProps) {
    const renderDayColumn = (day: string) => {
        const dayData = groupedAnime.find((d) => d.day === day) || { day, anime: [] };
        const isToday = isCurrentDay(day);
    
        return (
          <GlassCard key={day} className={`w-[160px] p-4 mr-4 ${isToday ? 'border-orange-500/50' : ''}`} variant={isToday ? 'dark' : 'default'} intensity={isToday ? 60 : 30}>
            <View className="mb-3">
              <Text className={`text-base font-bold mb-1 ${isToday ? 'text-orange-400' : 'text-white'}`}>
                {dayShortName(day)}
              </Text>
              <Text className="text-white/40 text-xs font-medium uppercase tracking-wider">{dayData.anime.length} shows</Text>
            </View>
            <ScrollView showsVerticalScrollIndicator className="max-h-[300px]">
              {dayData.anime.length === 0 ? (
                <View className="py-6 items-center">
                  <Text className="text-white/20 text-sm">No Signal</Text>
                </View>
              ) : (
                <View className="gap-3">
                  {dayData.anime.map((anime: Anime) => (
                    <View key={anime.id} className="bg-white/5 rounded-2xl p-3 border border-white/5">
                      <View className="w-full h-24 bg-black/20 rounded-xl mb-2" />
                      <Text className="text-white text-xs font-semibold mb-1.5 leading-4" numberOfLines={2}>
                        {anime.title}
                      </Text>
                      {anime.broadcast?.time && (
                        <View className="flex-row items-center gap-1">
                          <Ionicons name="time-outline" size={10} color="#f97316" />
                          <Text className="text-orange-400 text-[10px] font-bold">{anime.broadcast.time}</Text>
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>
          </GlassCard>
        );
      };

    return (
        <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false} 
            className="flex-1"
            contentContainerStyle={{ paddingLeft: 20, paddingRight: 20 }}
        >
            <View className="flex-row py-2">
                {weekDays.map((day) => renderDayColumn(day))}
            </View>
        </ScrollView>
    );
}
