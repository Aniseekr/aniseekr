import { View, ScrollView, RefreshControl, Dimensions, Text } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, useCallback, useMemo } from 'react';
import { SeasonHeader } from '../components/bangumi/SeasonHeader';
import { WeeklyCalendar, Anime } from '../components/bangumi/WeeklyCalendar';
import { AnimeList, AnimeRowCard } from '../components/bangumi/AnimeList';
import { LinearGradient } from 'expo-linear-gradient';

type ViewMode = 'calendar' | 'list';
type FilterMode = 'all' | 'tracking';
type Season = 'winter' | 'spring' | 'summer' | 'fall';

interface DailyAnime {
  day: string;
  anime: Anime[];
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

  const listViewData = groupedAnime.filter((g) => g.anime.length > 0 || (g.day === 'Unknown' && showUnknownDays));

  if (isLoading && !refreshing) {
    return (
      <SafeAreaView style={{ paddingTop: top }} className="flex-1 bg-bg-dark items-center justify-center">
        <Text className="text-white/80 text-base">Loading...</Text>
      </SafeAreaView>
    );
  }

  return (
    <View className="flex-1 bg-bg-dark">
        <LinearGradient
            colors={['#1a1b2e', '#13131f', '#0f0f16']}
            className="absolute inset-0"
        />
        <SafeAreaView style={{ paddingTop: top }} className="flex-1">
            <View className="px-5 pt-5">
                <SeasonHeader 
                    seasonDisplayName={seasonDisplayName}
                    onPrevSeason={switchToPreviousSeason}
                    onNextSeason={switchToNextSeason}
                    filterMode={filterMode}
                    onFilterChange={setFilterMode}
                    viewMode={viewMode}
                    onViewModeToggle={toggleViewMode}
                />
            </View>

            {viewMode === 'calendar' ? (
                 <WeeklyCalendar 
                    weekDays={weekDays}
                    groupedAnime={groupedAnime}
                    isCurrentDay={(day) => day === getTodayDayString()}
                    dayShortName={dayShortName}
                 />
            ) : (
                <ScrollView
                    className="flex-1"
                    contentContainerStyle={{ paddingBottom: 100 }}
                    refreshControl={<RefreshControl tintColor="#fff" refreshing={refreshing} onRefresh={onRefresh} />}
                >
                    <AnimeList listViewData={listViewData} renderAnimeCard={(anime) => <AnimeRowCard key={anime.id} anime={anime} />} />
                </ScrollView>
            )}
        </SafeAreaView>
    </View>
  );
}
