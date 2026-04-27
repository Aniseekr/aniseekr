import { View, Text, Platform, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Colors, Radius, TabBar as TabBarTokens } from '../constants/DesignSystem';

const PILL_HORIZONTAL_MARGIN = 16;
const PILL_INNER_PADDING = 8;

export default function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  const bottomMargin = Platform.select({
    ios: insets.bottom > 0 ? insets.bottom : 16,
    android: insets.bottom > 0 ? insets.bottom + 12 : 20,
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

  const visibleRoutes = state.routes.filter((route) => {
    const { options } = descriptors[route.key];
    return !isHidden(options);
  });

  return (
    <View style={[styles.container, { bottom: bottomMargin }]} pointerEvents="box-none">
      <View style={styles.pill}>
        <BlurView
          intensity={Platform.OS === 'ios' ? 60 : 80}
          tint="dark"
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.pillBackground} pointerEvents="none" />
        <View style={styles.pillBorder} pointerEvents="none" />

        <View style={styles.tabRow}>
          {visibleRoutes.map((route) => {
            const { options } = descriptors[route.key];
            const realIndex = state.routes.findIndex((r) => r.key === route.key);
            const isFocused = state.index === realIndex;

            const label =
              options.tabBarLabel !== undefined
                ? options.tabBarLabel
                : options.title !== undefined
                  ? options.title
                  : route.name;

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
              navigation.emit({ type: 'tabLongPress', target: route.key });
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
    </View>
  );
}

function TabItem({ isFocused, label, onPress, onLongPress, options }: any) {
  const scale = useSharedValue(1);
  const indicatorScale = useSharedValue(isFocused ? 1 : 0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ scale: indicatorScale.value }],
    opacity: indicatorScale.value,
  }));

  if (isFocused) {
    indicatorScale.value = withSpring(1, { damping: 14, stiffness: 200 });
  } else {
    indicatorScale.value = withSpring(0, { damping: 14, stiffness: 200 });
  }

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
      style={styles.tabItem}>
      <Animated.View style={[styles.indicator, indicatorStyle]} pointerEvents="none" />
      <Animated.View style={[styles.tabContent, animatedStyle]}>
        {options.tabBarIcon &&
          options.tabBarIcon({
            focused: isFocused,
            color: isFocused ? '#fff' : Colors.text.tertiary,
            size: TabBarTokens.iconSize + 4,
          })}
        <Text
          style={[
            styles.label,
            { color: isFocused ? '#fff' : Colors.text.tertiary },
          ]}
          numberOfLines={1}>
          {typeof label === 'string' ? label : ''}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: PILL_HORIZONTAL_MARGIN,
    right: PILL_HORIZONTAL_MARGIN,
    alignItems: 'center',
  },
  pill: {
    width: '100%',
    borderRadius: Radius.tabBar,
    overflow: 'hidden',
    paddingHorizontal: PILL_INNER_PADDING,
    height: TabBarTokens.height,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.18,
        shadowRadius: 16,
      },
      android: { elevation: 12 },
    }),
  },
  pillBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(28,28,30,0.78)',
  },
  pillBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: Radius.tabBar,
    borderWidth: 1,
    borderColor: Colors.glass.border,
  },
  tabRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
  indicator: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    left: 4,
    right: 4,
    borderRadius: Radius.tabActive,
    backgroundColor: Colors.primary,
  },
  tabContent: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: TabBarTokens.itemGap,
  },
  label: {
    fontSize: TabBarTokens.labelSize,
    fontWeight: '600',
    textAlign: 'center',
  },
});
