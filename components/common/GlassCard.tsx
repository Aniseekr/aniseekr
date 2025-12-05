import { View, ViewProps, Platform, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { memo } from 'react';

interface GlassCardProps extends ViewProps {
  children: React.ReactNode;
  intensity?: number;
}

function GlassCardComponent({ children, style, intensity = 20, className, ...props }: GlassCardProps & { className?: string }) {
  if (Platform.OS === 'ios') {
    return (
      <BlurView intensity={intensity} tint="dark" style={[styles.base, style]} {...props}>
        <View className={className || "bg-white/10"}>{children}</View>
      </BlurView>
    );
  }

  return (
    <View className={className || "bg-white/10"} style={[styles.base, styles.android, style]} {...props}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 32,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  android: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
  },
});

export const GlassCard = memo(GlassCardComponent);


