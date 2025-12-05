import { View, Text, Pressable } from 'react-native';
import { GlassCard } from '../common/GlassCard';
import FontAwesome5 from '@expo/vector-icons/FontAwesome5';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

interface GachaHeaderProps {
  coinBalance: number;
  onShowDropRates: () => void;
  onShowReconstruction: () => void;
}

export function GachaHeader({ coinBalance, onShowDropRates, onShowReconstruction }: GachaHeaderProps) {
  return (
    <View className="flex-row items-center justify-between mb-8 px-2">
      <View>
        <Text className="text-white/50 text-xs font-bold tracking-[0.2em] mb-3 ml-2">SIGNAL SCANNER</Text>
        <GlassCard className="px-5 py-3 rounded-[28px]" variant="dark">
          <View className="flex-row items-center gap-3">
            <View className="w-10 h-10 rounded-full bg-yellow-500/20 items-center justify-center border border-yellow-500/30">
              <FontAwesome5 name="coins" size={18} color="#fbbf24" />
            </View>
            <Text className="text-white text-2xl font-bold tracking-tight">{coinBalance}</Text>
            <Pressable className="px-4 py-2 bg-yellow-500 rounded-full shadow-lg shadow-yellow-500/20 active:opacity-80">
              <Text className="text-black text-xs font-extra-bold uppercase tracking-wider">+ ADD</Text>
            </Pressable>
          </View>
        </GlassCard>
      </View>
      <View className="flex-row items-center gap-3">
        <GlassCard className="rounded-full w-14 h-14 p-0" variant="dark">
           <Pressable onPress={onShowDropRates} className="w-full h-full items-center justify-center bg-white/5 active:bg-white/10">
            <Ionicons name="information-circle-outline" size={24} color="rgba(255,255,255,0.7)" />
          </Pressable>
        </GlassCard>
         <GlassCard className="rounded-full w-14 h-14 p-0" variant="dark">
          <Pressable onPress={onShowReconstruction} className="w-full h-full items-center justify-center bg-cyan-500/10 active:bg-cyan-500/20">
            <MaterialIcons name="auto-awesome" size={24} color="#06b6d4" />
          </Pressable>
        </GlassCard>
      </View>
    </View>
  );
}
