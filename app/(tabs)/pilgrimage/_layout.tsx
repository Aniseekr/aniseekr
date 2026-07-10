import { Stack } from 'expo-router';

export default function PilgrimageLayout() {
  // The hub map renders its own native <MapSurface> inline (see map.tsx). A
  // native map inside the screen is hidden correctly by the navigator when
  // covered and stays warm while the hub sits under a pushed detail screen, so
  // no shared keep-alive host is needed. A native map inside the screen stays
  // warm under pushed detail screens, and portal-based GL surfaces can bleed
  // through opacity gates on back-navigation.
  //
  // The hub-snapshot cache warm lives in app/_layout.tsx (root) — an effect
  // here would run in the same commit as the hub's useState initializer and
  // always lose that race.
  return <Stack screenOptions={{ headerShown: false }} />;
}
