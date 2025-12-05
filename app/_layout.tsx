import 'react-native-gesture-handler';
import '../global.css';
import { Tabs } from 'expo-router';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import FontAwesome5 from '@expo/vector-icons/FontAwesome5';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            position: 'absolute',
            bottom: Platform.OS === 'ios' ? 20 : 10,
            left: 16,
            right: 16,
            height: 70,
            backgroundColor: Platform.OS === 'ios' ? 'rgba(13, 13, 16, 0.8)' : 'rgba(13, 13, 16, 0.95)',
            borderRadius: 32,
            borderTopWidth: 0,
            borderTopColor: 'transparent',
            elevation: 20,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.4,
            shadowRadius: 24,
            paddingBottom: Platform.OS === 'ios' ? 8 : 8,
            paddingTop: 8,
          },
          tabBarActiveTintColor: '#fff',
          tabBarInactiveTintColor: '#9ca3af',
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: '600',
            marginTop: 4,
          },
        }}
      >
        <Tabs.Screen
          name="(rate)"
          options={{
            title: 'Home',
            tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size || 24} color={color} />,
          }}
        />
        <Tabs.Screen
          name="bangumi"
          options={{
            title: 'Bangumi',
            tabBarIcon: ({ color, size }) => <Ionicons name="calendar" size={size || 24} color={color} />,
          }}
        />
        <Tabs.Screen
          name="collection"
          options={{
            title: 'Collection',
            tabBarIcon: ({ color, size }) => <MaterialIcons name="collections" size={size || 24} color={color} />,
          }}
        />
        <Tabs.Screen
          name="gacha"
          options={{
            title: 'Gacha',
            tabBarIcon: ({ color, size }) => <FontAwesome5 name="gift" size={size || 24} color={color} />,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ color, size }) => <Ionicons name="person-circle" size={size || 24} color={color} />,
          }}
        />
      </Tabs>
    </SafeAreaProvider>
  );
}
