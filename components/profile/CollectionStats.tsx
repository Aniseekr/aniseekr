import { View, Text, ScrollView } from 'react-native';
import { GlassCard } from '../common/GlassCard';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import FontAwesome5 from '@expo/vector-icons/FontAwesome5';

interface AccountStatCardProps {
  title: string;
  value: string;
  icon: any;
  iconSet: 'Ionicons' | 'MaterialIcons' | 'FontAwesome5';
  color: string;
}

function AccountStatCard({ title, value, icon, iconSet, color }: AccountStatCardProps) {
  const IconComponent = iconSet === 'Ionicons' ? Ionicons : iconSet === 'MaterialIcons' ? MaterialIcons : FontAwesome5;
  return (
    <GlassCard className="w-[140px] h-[170px] items-center justify-center p-6 mr-4" variant="frosted" intensity={25}>
      <View className="w-14 h-14 rounded-2xl items-center justify-center mb-5 border border-white/5" style={{ backgroundColor: `${color}15` }}>
        <IconComponent name={icon} size={28} color={color} />
      </View>
      <Text className="text-white text-3xl font-bold mb-1 tracking-tight">{value}</Text>
      <Text className="text-white/40 text-[10px] font-bold uppercase tracking-widest">{title}</Text>
    </GlassCard>
  );
}

interface CollectionStatsProps {
    stats: {
        totalRated: number;
        likedCount: number;
        cardsCount: number;
        foldersCount: number;
    }
}

export function CollectionStats({ stats }: CollectionStatsProps) {
    return (
    <View className="mb-10">
      <Text className="text-white text-xl font-bold mb-5 px-5 tracking-tight">Overview</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingLeft: 20, paddingRight: 4 }}>
        <AccountStatCard title="Rated" value={stats.totalRated.toString()} icon="star" iconSet="Ionicons" color="#fbbf24" />
        <AccountStatCard title="Liked" value={stats.likedCount.toString()} icon="heart" iconSet="Ionicons" color="#ef4444" />
        <AccountStatCard title="Cards" value={stats.cardsCount.toString()} icon="cube" iconSet="Ionicons" color="#3b82f6" />
        <AccountStatCard title="Folders" value={stats.foldersCount.toString()} icon="folder" iconSet="Ionicons" color="#10b981" />
      </ScrollView>
    </View>
    );
}
