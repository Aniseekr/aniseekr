import { ScrollView, Text, View, RefreshControl, Pressable } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, useCallback, useMemo } from 'react';
import { GlassCard } from '../components/common/GlassCard';
import Ionicons from '@expo/vector-icons/Ionicons';

type ViewMode = 'calendar' | 'list';
type FilterMode = 'all' | 'tracking';
type Season = 'winter' | 'spring' | 'summer' | 'fall';

interface DailyAnime {
  day: string;
  anime: Anime[];
}

interface Anime {
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

const weekDays = ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays'];

function getCurrentSeason(): { season: Season; year: number } {
  const date = new Date();
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  
  let season: Season = 'winter';
  if (month >= 4 && month <= 6) season = 'spring';
  else if (month >= 7 && month <= 9) season = 'summer';
  else if (month >= 10) season = 'fall';
  
  return { season, year };
}

function getTodayDayString(): string {
  const day = new Date().getDay();
  const dayMapping: { [key: number]: string } = {
    0: 'Sundays',
    1: 'Mondays',
    2: 'Tuesdays',
    3: 'Wednesdays',
    4: 'Thursdays',
    5: 'Fridays',
    6: 'Saturdays',
  };
  return dayMapping[day] || 'Mondays';
}

function dayShortName(day: string): string {
  const mapping: { [key: string]: string } = {
    Mondays: 'Mon',
    Tuesdays: 'Tue',
    Wednesdays: 'Wed',
    Thursdays: 'Thu',
    Fridays: 'Fri',
    Saturdays: 'Sat',
    Sundays: 'Sun',
  };
  return mapping[day] || day;
}

function isCurrentDay(day: string): boolean {
  return day === getTodayDayString();
}

export default function BangumiScreen() {
  const { top } = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('calendar');
  const [filterMode, setFilterMode] = useState<FilterMode>('tracking');
  const [showUnknownDays, setShowUnknownDays] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const { season: currentSeason, year: currentYear } = getCurrentSeason();
  const [selectedSeason, setSelectedSeason] = useState<Season>(currentSeason);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [groupedAnime, setGroupedAnime] = useState<DailyAnime[]>([]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setIsLoading(true);
    // TODO: Fetch seasonal anime from API
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setRefreshing(false);
    setIsLoading(false);
  }, []);

  const toggleViewMode = useCallback(() => {
    setViewMode((prev) => (prev === 'calendar' ? 'list' : 'calendar'));
  }, []);

  const switchToPreviousSeason = useCallback(() => {
    const seasonOrder: Season[] = ['winter', 'spring', 'summer', 'fall'];
    const currentIndex = seasonOrder.indexOf(selectedSeason);
    if (currentIndex === 0) {
      setSelectedYear((prev) => prev - 1);
      setSelectedSeason('fall');
    } else {
      setSelectedSeason(seasonOrder[currentIndex - 1]);
    }
    onRefresh();
  }, [selectedSeason, onRefresh]);

  const switchToNextSeason = useCallback(() => {
    const seasonOrder: Season[] = ['winter', 'spring', 'summer', 'fall'];
    const currentIndex = seasonOrder.indexOf(selectedSeason);
    if (currentIndex === seasonOrder.length - 1) {
      setSelectedYear((prev) => prev + 1);
      setSelectedSeason('winter');
    } else {
      setSelectedSeason(seasonOrder[currentIndex + 1]);
    }
    onRefresh();
  }, [selectedSeason, onRefresh]);

  const seasonDisplayName = useMemo(() => {
    return `${selectedYear} ${selectedSeason.charAt(0).toUpperCase() + selectedSeason.slice(1)}`;
  }, [selectedSeason, selectedYear]);

  const headerSection = (
    <GlassCard className="p-6 mb-6">
      <View className="mb-4">
        <View className="flex-row items-center justify-between mb-4">
          <Text className="text-white text-2xl font-bold">Weekly Schedule</Text>
          <View className="flex-row items-center gap-3">
            <Pressable
              onPress={switchToPreviousSeason}
              className="w-10 h-10 rounded-2xl bg-white/10 items-center justify-center"
            >
              <Text className="text-white text-base font-semibold">←</Text>
            </Pressable>
            <View className="px-5 py-2.5 bg-white/10 rounded-3xl">
              <Text className="text-white text-base font-semibold">{seasonDisplayName}</Text>
            </View>
            <Pressable
              onPress={switchToNextSeason}
              className="w-10 h-10 rounded-2xl bg-white/10 items-center justify-center"
            >
              <Text className="text-white text-base font-semibold">→</Text>
            </Pressable>
          </View>
        </View>
        <View className="flex-row items-center justify-between">
          <View className="flex-row bg-white/10 rounded-3xl p-1.5" style={{ width: 180 }}>
            <Pressable
              onPress={() => setFilterMode('tracking')}
              className={`flex-1 py-3 rounded-3xl ${filterMode === 'tracking' ? 'bg-white' : ''}`}
            >
              <Text
                className={`text-center text-sm font-semibold ${filterMode === 'tracking' ? 'text-black' : 'text-white/70'}`}
              >
                Tracking
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setFilterMode('all')}
              className={`flex-1 py-3 rounded-3xl ${filterMode === 'all' ? 'bg-white' : ''}`}
            >
              <Text
                className={`text-center text-sm font-semibold ${filterMode === 'all' ? 'text-black' : 'text-white/70'}`}
              >
                All
              </Text>
            </Pressable>
          </View>
          <Pressable onPress={toggleViewMode} className="w-12 h-12 rounded-3xl bg-white/15 items-center justify-center">
            <Ionicons name={viewMode === 'calendar' ? 'list' : 'calendar'} size={20} color="#fff" />
          </Pressable>
        </View>
      </View>
    </GlassCard>
  );

  const renderDayColumn = (day: string) => {
    const dayData = groupedAnime.find((d) => d.day === day) || { day, anime: [] };
    const isToday = isCurrentDay(day);

    return (
      <View key={day} className="w-[160px] p-4 rounded-3xl bg-white/5 border border-white/10">
        <View className="mb-3">
          <Text className={`text-white text-base font-bold ${isToday ? 'text-orange-500' : ''}`}>
            {dayShortName(day)}
          </Text>
          <Text className="text-white/60 text-sm">{dayData.anime.length} shows</Text>
        </View>
        <ScrollView showsVerticalScrollIndicator>
          {dayData.anime.length === 0 ? (
            <View className="py-6 items-center">
              <Text className="text-white/30 text-sm">No anime</Text>
            </View>
          ) : (
            <View className="gap-3">
              {dayData.anime.map((anime) => (
                <View key={anime.id} className="bg-white/5 rounded-2xl p-2.5">
                  <View className="w-full h-24 bg-white/10 rounded-2xl mb-2" />
                  <Text className="text-white text-xs font-semibold mb-1.5" numberOfLines={2}>
                    {anime.title}
                  </Text>
                  {anime.broadcast?.time && (
                    <View className="flex-row items-center gap-1">
                      <Ionicons name="time-outline" size={12} color="#f97316" />
                      <Text className="text-orange-500 text-xs">{anime.broadcast.time}</Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </View>
    );
  };

  const renderAnimeCard = ({ item: anime }: { item: Anime }) => (
    <GlassCard className="p-5 mb-5">
      <View className="flex-row gap-4">
        <View className="w-24 h-36 bg-white/10 rounded-3xl" />
        <View className="flex-1">
          <Text className="text-white text-lg font-bold mb-2" numberOfLines={2}>
            {anime.title}
          </Text>
          {anime.broadcast?.string && (
            <View className="flex-row items-center gap-2 mb-3">
              <Ionicons name="time-outline" size={14} color="#f97316" />
              <Text className="text-orange-500 text-sm">{anime.broadcast.string}</Text>
            </View>
          )}
          {anime.genres && anime.genres.length > 0 && (
            <View className="flex-row flex-wrap gap-2 mb-3">
              {anime.genres.slice(0, 3).map((genre, idx) => (
                <View key={idx} className="px-3 py-1.5 bg-orange-500/20 rounded-2xl">
                  <Text className="text-orange-500 text-xs font-medium">{genre.name}</Text>
                </View>
              ))}
            </View>
          )}
          <Pressable className="self-start px-5 py-2.5 bg-white/10 rounded-3xl">
            <Text className="text-white text-sm font-medium">Remind Me</Text>
          </Pressable>
        </View>
      </View>
    </GlassCard>
  );

  const calendarView = (
    <ScrollView 
      horizontal 
      showsHorizontalScrollIndicator={false} 
      className="flex-1"
      contentContainerStyle={{ paddingBottom: 100 }}
    >
      <View className="flex-row gap-4 px-5 py-5">
        {weekDays.map((day) => renderDayColumn(day))}
      </View>
    </ScrollView>
  );

  const listViewData = groupedAnime.filter((g) => g.anime.length > 0 || (g.day === 'Unknown' && showUnknownDays));

  const listView = (
    <View className="px-5">
      {listViewData.map((group) => (
        <View key={group.day} className="mb-6">
          <Text className="text-white text-xl font-bold mb-4">{group.day}</Text>
          {group.anime.map((anime) => renderAnimeCard({ item: anime }))}
        </View>
      ))}
    </View>
  );

  if (isLoading && !refreshing) {
    return (
      <SafeAreaView style={{ paddingTop: top }} className="flex-1 bg-bg-dark items-center justify-center">
        <Text className="text-white/80 text-base">Loading seasonal anime...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ paddingTop: top }} className="flex-1 bg-bg-dark">
      <View className="px-5 pt-5">
        {headerSection}
      </View>
      {viewMode === 'calendar' ? (
        calendarView
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 100 }}
          refreshControl={<RefreshControl tintColor="#fff" refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {listView}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

