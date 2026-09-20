import { Tabs } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import FloatingTabBar from '../../components/FloatingTabBar';
import { useT } from '../../libs/i18n';
import { useExperienceMode } from '../../hooks/useExperienceMode';
import type { ExperienceTabId } from '../../libs/navigation/experience-tabs';

export default function TabsLayout() {
  const t = useT();
  const { mode, visibleTabs } = useExperienceMode();
  const visible = new Set<ExperienceTabId>(visibleTabs);
  const href = (tab: ExperienceTabId, path: string) => (visible.has(tab) ? path : null);

  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#fff',
        tabBarInactiveTintColor: '#FFFFFF60',
      }}>
      <Tabs.Screen
        name="(rate)"
        options={{
          title: mode === 'collector' ? t('tabs.rateScreen.mode.discovery') : t('tabs.rate'),
          href: href('discover', '/(rate)'),
          tabBarIcon: ({ color }) => (
            <MaterialIcons
              name={mode === 'collector' ? 'explore' : 'home-filled'}
              size={26}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="bangumi"
        options={{
          title: t('tabs.bangumi'),
          href: href('bangumi', '/bangumi'),
          tabBarIcon: ({ color }) => <MaterialIcons name="date-range" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="collection"
        options={{
          title: t('tabs.collection'),
          href: href('collection', '/collection'),
          tabBarIcon: ({ color }) => <MaterialIcons name="bookmark" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="pilgrimage"
        options={{
          title: t('tabs.pilgrimage'),
          href: href('pilgrimage', '/pilgrimage'),
          tabBarIcon: ({ color }) => <MaterialIcons name="place" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tabs.profile'),
          href: '/profile',
          tabBarIcon: ({ color }) => <MaterialIcons name="person" size={26} color={color} />,
        }}
      />
    </Tabs>
  );
}
