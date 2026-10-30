import { Tabs } from 'expo-router';
import { useMemo } from 'react';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import FloatingTabBar from '../../components/FloatingTabBar';
import { EXPERIENCE_TAB_META } from '../../components/navigation/experience-tab-meta';
import { useT } from '../../libs/i18n';
import { useExperienceMode } from '../../hooks/useExperienceMode';
import {
  EXPERIENCE_TAB_HREFS,
  resolveExperienceRouteNames,
  type ExperienceTabId,
} from '../../libs/navigation/experience-tabs';

export default function TabsLayout() {
  const t = useT();
  const { experience, visibleTabs } = useExperienceMode();
  const visible = new Set<ExperienceTabId>(visibleTabs);
  const visibleRouteNames = useMemo(() => resolveExperienceRouteNames(experience), [experience]);
  const href = (tab: ExperienceTabId) => (visible.has(tab) ? EXPERIENCE_TAB_HREFS[tab] : null);

  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} visibleRouteNames={visibleRouteNames} />}
      screenOptions={{ headerShown: false }}>
      <Tabs.Screen
        name="(rate)"
        options={{
          title: t(EXPERIENCE_TAB_META.discover.labelKey),
          href: href('discover'),
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons
              name={EXPERIENCE_TAB_META.discover.icon}
              size={size}
              color={color as string}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="bangumi"
        options={{
          title: t(EXPERIENCE_TAB_META.bangumi.labelKey),
          href: href('bangumi'),
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons
              name={EXPERIENCE_TAB_META.bangumi.icon}
              size={size}
              color={color as string}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="collection"
        options={{
          title: t(EXPERIENCE_TAB_META.collection.labelKey),
          href: href('collection'),
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons
              name={EXPERIENCE_TAB_META.collection.icon}
              size={size}
              color={color as string}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="pilgrimage"
        options={{
          title: t(EXPERIENCE_TAB_META.pilgrimage.labelKey),
          href: href('pilgrimage'),
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons
              name={EXPERIENCE_TAB_META.pilgrimage.icon}
              size={size}
              color={color as string}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="explorer-camera"
        options={{
          title: t(EXPERIENCE_TAB_META.explorerCamera.labelKey),
          href: href('explorerCamera'),
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons
              name={EXPERIENCE_TAB_META.explorerCamera.icon}
              size={size}
              color={color as string}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="explorer-journal"
        options={{
          title: t(EXPERIENCE_TAB_META.explorerJournal.labelKey),
          href: href('explorerJournal'),
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons
              name={EXPERIENCE_TAB_META.explorerJournal.icon}
              size={size}
              color={color as string}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t(EXPERIENCE_TAB_META.profile.labelKey),
          href: EXPERIENCE_TAB_HREFS.profile,
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons
              name={EXPERIENCE_TAB_META.profile.icon}
              size={size}
              color={color as string}
            />
          ),
        }}
      />
    </Tabs>
  );
}
