import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { GlassCard } from '../common/GlassCard';
import FontAwesome5 from '@expo/vector-icons/FontAwesome5';
import { LinearGradient } from 'expo-linear-gradient';

interface PackCarouselProps {
  onPull: () => void;
  canAfford: boolean;
  isPulling: boolean;
  pullCost: number;
  cardsPerPull: number;
}

export function PackCarousel({ onPull, canAfford, isPulling, pullCost, cardsPerPull }: PackCarouselProps) {
  return (
    <View className="flex-1 items-center justify-center py-4">
      <GlassCard className="w-[340px] h-[520px] p-0 overflow-hidden" variant="frosted">
        <LinearGradient
            colors={['rgba(255,255,255,0.05)', 'transparent']}
            className="absolute inset-0"
        />
        <View className="flex-1 items-center justify-center p-8">
            <View className="w-32 h-32 rounded-[40px] bg-white/5 border border-white/10 items-center justify-center mb-8 shadow-2xl shadow-blue-500/20">
            <FontAwesome5 name="box-open" size={56} color="#fff" style={{ opacity: 0.9 }} />
            </View>
            <Text className="text-white text-3xl font-bold mb-3 text-center tracking-tight">Standard Signal</Text>
            <Text className="text-white/50 text-base mb-10 text-center font-medium tracking-wide">
                CONTAINS <Text className="text-white">{cardsPerPull}</Text> SIGNALS
            </Text>
            
            <Pressable
            onPress={onPull}
            disabled={!canAfford || isPulling}
            className={`w-full h-16 rounded-full overflow-hidden ${canAfford ? 'shadow-lg shadow-white/10' : 'opacity-50'}`}
            >
             {({ pressed }) => (
                 <View className={`w-full h-full items-center justify-center ${canAfford ? 'bg-white' : 'bg-white/20'} ${pressed ? 'bg-gray-200' : ''}`}>
                    {isPulling ? (
                        <ActivityIndicator color="#000" />
                    ) : (
                        <View className="items-center flex-row gap-2">
                            <Text className="text-black text-lg font-bold tracking-widest">SCAN NOW</Text>
                            <View className="w-1 h-1 rounded-full bg-black/30" />
                            <Text className="text-black/60 text-sm font-bold">{pullCost} COINS</Text>
                        </View>
                    )}
                 </View>
             )}
            </Pressable>
        </View>
      </GlassCard>
    </View>
  );
}
