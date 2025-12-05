import { View, Text, Image, Pressable } from 'react-native';
import { GlassCard } from '../common/GlassCard';
import Ionicons from '@expo/vector-icons/Ionicons';
import FontAwesome5 from '@expo/vector-icons/FontAwesome5';

interface ProfileHeaderProps {
  username: string;
  profileImageURL: string;
  isDonator: boolean;
}

export function ProfileHeader({ username, profileImageURL, isDonator }: ProfileHeaderProps) {
  return (
    <GlassCard className="p-8 mx-5 mt-5 mb-8" variant="dark" intensity={40} style={{ borderRadius: 40 }}>
      {/* Decorative background blur */}
      <View className="absolute top-0 right-0 w-32 h-32 bg-blue-500/20 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
      
      <View className="items-center py-4">
        <View className="w-[140px] h-[140px] rounded-full bg-white/5 border-2 border-white/20 items-center justify-center mb-6 shadow-xl shadow-black/40">
          {profileImageURL ? (
            <Image source={{ uri: profileImageURL }} className="w-full h-full rounded-full" />
          ) : (
            <Ionicons name="person" size={64} color="rgba(255,255,255,0.3)" />
          )}
        </View>
        <View className="flex-row items-center gap-3 mb-6">
          <Text className="text-white text-4xl font-bold tracking-tight">{username}</Text>
          {isDonator && (
            <View className="px-3 py-1.5 bg-yellow-400 rounded-full flex-row items-center gap-1.5 shadow-lg shadow-yellow-500/20">
              <FontAwesome5 name="crown" size={12} color="#000" />
              <Text className="text-black text-xs font-extra-bold uppercase tracking-wider">VIP</Text>
            </View>
          )}
        </View>
        <View className="flex-row gap-5">
           <SocialLink icon={<Ionicons name="logo-github" size={24} color="#fff" />} color="bg-gray-800" />
           <SocialLink icon={<Ionicons name="logo-twitter" size={24} color="#fff" />} color="bg-sky-500" />
           <SocialLink icon={<Ionicons name="mail" size={24} color="#fff" />} color="bg-purple-500" />
        </View>
      </View>
    </GlassCard>
  );
}

function SocialLink({ icon, color }: { icon: any, color: string }) {
    return (
        <Pressable className={`w-12 h-12 rounded-full ${color} items-center justify-center shadow-lg active:opacity-80`}>
            {icon}
        </Pressable>
    )
}
