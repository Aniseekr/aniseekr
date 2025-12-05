import { View, Text, Pressable } from 'react-native';
import { GlassCard } from '../common/GlassCard';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

interface GachaControlsProps {
  onShowHistory: () => void;
  onShowCollection: () => void;
  onShowRanking: () => void;
}

export function GachaControls({ onShowHistory, onShowCollection, onShowRanking }: GachaControlsProps) {
  return (
    <GlassCard className="py-5 px-6 rounded-[36px]" variant="dark" intensity={40}>
      <View className="flex-row justify-around items-center">
        <ControlButton 
            icon={<Ionicons name="time-outline" size={26} color="rgba(255,255,255,0.9)" />} 
            label="History" 
            onPress={onShowHistory} 
        />
        <View className="w-[1px] h-10 bg-white/10" />
        <ControlButton 
            icon={<MaterialIcons name="collections" size={26} color="rgba(255,255,255,0.9)" />} 
            label="Collection" 
            onPress={onShowCollection} 
        />
        <View className="w-[1px] h-10 bg-white/10" />
        <ControlButton 
            icon={<Ionicons name="stats-chart" size={26} color="rgba(255,255,255,0.9)" />} 
            label="Ranking" 
            onPress={onShowRanking} 
        />
      </View>
    </GlassCard>
  );
}

function ControlButton({ icon, label, onPress }: { icon: React.ReactNode, label: string, onPress: () => void }) {
    return (
        <Pressable onPress={onPress} className="items-center px-4 active:opacity-60">
          <View className="mb-2">
            {icon}
          </View>
          <Text className="text-white/60 text-[10px] font-bold uppercase tracking-widest">{label}</Text>
        </Pressable>
    )
}
