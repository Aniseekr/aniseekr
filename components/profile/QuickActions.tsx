import { View, Text, Pressable } from 'react-native';
import { GlassCard } from '../common/GlassCard';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import FontAwesome5 from '@expo/vector-icons/FontAwesome5';

interface QuickActionButtonProps {
  icon: any;
  iconSet: 'Ionicons' | 'MaterialIcons' | 'FontAwesome5';
  title: string;
  color: string;
  onPress: () => void;
}

function QuickActionButton({ icon, iconSet, title, color, onPress }: QuickActionButtonProps) {
  const IconComponent = iconSet === 'Ionicons' ? Ionicons : iconSet === 'MaterialIcons' ? MaterialIcons : FontAwesome5;
  return (
    <Pressable onPress={onPress} className="items-center flex-1 active:opacity-60">
      <View className="w-16 h-16 rounded-[24px] items-center justify-center mb-3 border border-white/5 shadow-md" style={{ backgroundColor: `${color}15` }}>
        <IconComponent name={icon} size={28} color={color} />
      </View>
      <Text className="text-white/60 text-[10px] font-bold uppercase tracking-wider">{title}</Text>
    </Pressable>
  );
}

interface QuickActionsProps {
    actions: {
        onPremium: () => void;
        onSync: () => void;
        onSettings: () => void;
        onBackup: () => void;
        onDNA: () => void;
    }
}

export function QuickActions({ actions }: QuickActionsProps) {
    return (
    <View className="mb-20">
      <Text className="text-white text-xl font-bold mb-5 px-5 tracking-tight">Quick Actions</Text>
      <GlassCard className="p-8 mx-5 rounded-[40px]" variant="dark" intensity={30}>
        <View className="flex-row justify-around">
          <QuickActionButton icon="diamond" iconSet="Ionicons" title="Premium" color="#fbbf24" onPress={actions.onPremium} />
          <QuickActionButton icon="sync" iconSet="Ionicons" title="Sync (ON)" color="#3b82f6" onPress={actions.onSync} />
          <QuickActionButton icon="settings-sharp" iconSet="Ionicons" title="Settings" color="#9ca3af" onPress={actions.onSettings} />
        </View>
        <View className="flex-row justify-around mt-8">
             <QuickActionButton icon="cloud-upload" iconSet="Ionicons" title="Backup" color="#06b6d4" onPress={actions.onBackup} />
            <QuickActionButton icon="dna" iconSet="Ionicons" title="Otaku DNA" color="#a855f7" onPress={actions.onDNA} />
             {/* Spacer to align grid if needed, or add more buttons */}
             <View className="flex-1" /> 
        </View>
      </GlassCard>
    </View>
    );
}
