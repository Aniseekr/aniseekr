import { View, Text, Pressable } from 'react-native';
import { GlassCard } from '../common/GlassCard';
import Ionicons from '@expo/vector-icons/Ionicons';

type Season = 'winter' | 'spring' | 'summer' | 'fall';
type FilterMode = 'all' | 'tracking';

interface SeasonHeaderProps {
  seasonDisplayName: string;
  onPrevSeason: () => void;
  onNextSeason: () => void;
  filterMode: FilterMode;
  onFilterChange: (mode: FilterMode) => void;
  viewMode: 'calendar' | 'list';
  onViewModeToggle: () => void;
}

export function SeasonHeader({ 
  seasonDisplayName, 
  onPrevSeason, 
  onNextSeason, 
  filterMode, 
  onFilterChange,
  viewMode,
  onViewModeToggle 
}: SeasonHeaderProps) {
  return (
    <GlassCard className="p-6 mb-6" variant="dark" intensity={50}>
      <View className="mb-4">
        <View className="flex-row items-center justify-between mb-4">
          <Text className="text-white text-2xl font-bold tracking-tight">Weekly Schedule</Text>
          <View className="flex-row items-center gap-3">
            <Pressable
              onPress={onPrevSeason}
              className="w-10 h-10 rounded-full bg-white/5 border border-white/10 items-center justify-center active:bg-white/20"
            >
              <Text className="text-white text-base font-semibold">←</Text>
            </Pressable>
            <View className="px-5 py-2.5 bg-white/5 border border-white/10 rounded-full">
              <Text className="text-white text-base font-semibold">{seasonDisplayName}</Text>
            </View>
            <Pressable
              onPress={onNextSeason}
              className="w-10 h-10 rounded-full bg-white/5 border border-white/10 items-center justify-center active:bg-white/20"
            >
              <Text className="text-white text-base font-semibold">→</Text>
            </Pressable>
          </View>
        </View>
        <View className="flex-row items-center justify-between">
          <View className="flex-row bg-black/20 rounded-full p-1 border border-white/5" style={{ width: 180 }}>
            <Pressable
              onPress={() => onFilterChange('tracking')}
              className={`flex-1 py-3 rounded-full ${filterMode === 'tracking' ? 'bg-white/20' : ''}`}
            >
              <Text
                className={`text-center text-sm font-semibold ${filterMode === 'tracking' ? 'text-white' : 'text-white/40'}`}
              >
                Tracking
              </Text>
            </Pressable>
            <Pressable
              onPress={() => onFilterChange('all')}
              className={`flex-1 py-3 rounded-full ${filterMode === 'all' ? 'bg-white/20' : ''}`}
            >
              <Text
                className={`text-center text-sm font-semibold ${filterMode === 'all' ? 'text-white' : 'text-white/40'}`}
              >
                All
              </Text>
            </Pressable>
          </View>
          <Pressable onPress={onViewModeToggle} className="w-12 h-12 rounded-full bg-white/5 border border-white/10 items-center justify-center active:bg-white/20">
            <Ionicons name={viewMode === 'calendar' ? 'list' : 'calendar'} size={20} color="#fff" />
          </Pressable>
        </View>
      </View>
    </GlassCard>
  );
}
