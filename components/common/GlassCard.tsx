import { View, ViewProps, Platform, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { memo } from 'react';

type GlassVariant = 'default' | 'clear' | 'frosted' | 'dark';

interface GlassCardProps extends ViewProps {
  children: React.ReactNode;
  intensity?: number;
  variant?: GlassVariant;
}

function GlassCardComponent({ children, style, intensity, variant = 'default', className, ...props }: GlassCardProps & { className?: string }) {
  const getIntensity = () => {
    if (intensity !== undefined) return intensity;
    switch (variant) {
      case 'clear': return 10;
      case 'frosted': return 60;
      case 'dark': return 40;
      default: return 30;
    }
  };

  const getTint = () => {
    switch (variant) {
      case 'clear': return 'light';
      case 'frosted': return 'default';
      case 'dark': return 'dark';
      default: return 'dark';
    }
  };

  const baseStyle = [styles.base, style];
  if (variant === 'dark') baseStyle.push(styles.darkBorder);

  if (Platform.OS === 'ios') {
    return (
      <BlurView intensity={getIntensity()} tint={getTint()} style={baseStyle} {...props}>
        <View className={`bg-white/5 ${className || ''}`}>{children}</View>
      </BlurView>
    );
  }

  // Android fallback
  return (
    <View className={`bg-white/10 ${className || ''}`} style={[styles.base, styles.android, style]} {...props}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 32,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)', // Slightly more visible border for "liquid" edge
  },
  darkBorder: {
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  android: {
    backgroundColor: 'rgba(30, 30, 30, 0.6)', 
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
  },
});

export const GlassCard = memo(GlassCardComponent);


