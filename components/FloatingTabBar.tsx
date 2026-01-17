import React from 'react';
import { View, Text, Platform, TouchableOpacity, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

export default function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  const bottomMargin = Platform.select({
    ios: insets.bottom > 0 ? insets.bottom : 20,
    android: insets.bottom > 0 ? insets.bottom + 12 : 24,
  });

  const isHidden = (options: any) =>
    options?.href === null ||
    (options?.tabBarStyle as any)?.display === 'none' ||
    options?.tabBarButton === null ||
    options?.tabBarVisible === false;

  const { options: activeOptions } = descriptors[state.routes[state.index].key];
  if (isHidden(activeOptions)) {
    return null;
  }

  return (
    <View style={[styles.container, { bottom: bottomMargin }]}>
      <BlurView
        intensity={Platform.OS === 'ios' ? 30 : 50}
        tint="dark"
        style={StyleSheet.absoluteFill}
      />
      
      {/* Optional: Add a subtle border overlay if BlurView doesn't support border directly nicely on all platforms */}
      <View style={styles.glassBorder} />

      <View style={styles.tabRow}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];

          // Hide hidden tabs for custom bar as well
          if (isHidden(options)) {
            return null;
          }

          const label =
            options.tabBarLabel !== undefined
              ? options.tabBarLabel
              : options.title !== undefined
              ? options.title
              : route.name;

          const isFocused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          const onLongPress = () => {
             navigation.emit({
              type: 'tabLongPress',
              target: route.key,
            });
          };

          return (
            <TabItem 
              key={route.key}
              isFocused={isFocused}
              label={label}
              onPress={onPress}
              onLongPress={onLongPress}
              options={options}
            />
          );
        })}
      </View>
    </View>
  );
}

function TabItem({ isFocused, label, onPress, onLongPress, options }: any) {
    const scale = useSharedValue(1);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
    }));

    const handlePressIn = () => {
        scale.value = withSpring(0.94, { damping: 10, stiffness: 300 });
    };

    const handlePressOut = () => {
        scale.value = withSpring(1, { damping: 10, stiffness: 300 });
    };

    return (
        <Pressable
            onPress={onPress}
            onLongPress={onLongPress}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            style={styles.tabItem}
        >
            <Animated.View style={[styles.tabContent, animatedStyle]}>
                {options.tabBarIcon && options.tabBarIcon({
                    focused: isFocused,
                    color: isFocused ? '#fff' : 'rgba(255,255,255,0.4)',
                    size: 24
                })}
                <Text style={[
                    styles.label, 
                    { color: isFocused ? '#fff' : 'rgba(255,255,255,0.4)' }
                ]}>
                    {typeof label === 'string' ? label : ''}
                </Text>
            </Animated.View>
        </Pressable>
    )
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    borderRadius: 32,
    overflow: 'hidden',
    backgroundColor: 'rgba(18,18,18,0.35)', // Semi-transparent background
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
      },
      android: {
        elevation: 12,
      },
    }),
  },
  glassBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    pointerEvents: 'none',
  },
  tabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabContent: {
      alignItems: 'center',
      justifyContent: 'center',
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 4,
    textAlign: 'center',
  },
});
