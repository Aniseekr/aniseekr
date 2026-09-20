import { Tabs } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import FloatingTabBar from '../../components/FloatingTabBar';
import { EXPERIENCE_TAB_META } from '../../components/navigation/experience-tab-meta';
import { useT } from '../../libs/i18n';
import { useExperienceMode } from '../../hooks/useExperienceMode';
import { EXPERIENCE_TAB_HREFS, type ExperienceTabId } from '../../libs/navigation/experience-tabs';

export default function TabsLayout() {
  const t = useT();
  const { mode, visibleTabs } = useExperienceMode();
  const visible = new Set<ExperienceTabId>(visibleTabs);
  const href = (tab: ExperienceTabId) => (visible.has(tab) ? EXPERIENCE_TAB_HREFS[tab] : null);

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
          title:
            mode === 'collector'
              ? t('tabs.rateScreen.mode.discovery')
              : t(EXPERIENCE_TAB_META.discover.labelKey),
          href: href('discover'),
          tabBarIcon: ({ color }) => (
            <MaterialIcons
              name={mode === 'collector' ? 'explore' : EXPERIENCE_TAB_META.discover.icon}
              size={26}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="bangumi"
        options={{
          title: t(EXPERIENCE_TAB_META.bangumi.labelKey),
          href: href('bangumi'),
          tabBarIcon: ({ color }) => (
            <MaterialIcons name={EXPERIENCE_TAB_META.bangumi.icon} size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="collection"
        options={{
          title: t(EXPERIENCE_TAB_META.collection.labelKey),
          href: href('collection'),
          tabBarIcon: ({ color }) => (
            <MaterialIcons name={EXPERIENCE_TAB_META.collection.icon} size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="pilgrimage"
        options={{
          title: t(EXPERIENCE_TAB_META.pilgrimage.labelKey),
          href: href('pilgrimage'),
          tabBarIcon: ({ color }) => (
            <MaterialIcons name={EXPERIENCE_TAB_META.pilgrimage.icon} size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="explorer-camera"
        options={{
          title: t(EXPERIENCE_TAB_META.explorerCamera.labelKey),
          href: href('explorerCamera'),
          tabBarIcon: ({ color }) => (
            <MaterialIcons name={EXPERIENCE_TAB_META.explorerCamera.icon} size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="explorer-search"
        options={{
          title: t(EXPERIENCE_TAB_META.explorerSearch.labelKey),
          href: href('explorerSearch'),
          tabBarIcon: ({ color }) => (
            <MaterialIcons name={EXPERIENCE_TAB_META.explorerSearch.icon} size={25} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="explorer-map"
        options={{
          title: t(EXPERIENCE_TAB_META.explorerMap.labelKey),
          href: href('explorerMap'),
          tabBarIcon: ({ color }) => (
            <MaterialIcons name={EXPERIENCE_TAB_META.explorerMap.icon} size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="explorer-journal"
        options={{
          title: t(EXPERIENCE_TAB_META.explorerJournal.labelKey),
          href: href('explorerJournal'),
          tabBarIcon: ({ color }) => (
            <MaterialIcons
              name={EXPERIENCE_TAB_META.explorerJournal.icon}
              size={24}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t(EXPERIENCE_TAB_META.profile.labelKey),
          href: EXPERIENCE_TAB_HREFS.profile,
          tabBarIcon: ({ color }) => (
            <MaterialIcons name={EXPERIENCE_TAB_META.profile.icon} size={26} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
