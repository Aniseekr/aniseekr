import { Stack } from 'expo-router';

import { MapHostProvider } from '../../../components/pilgrimage/MapHost';

export default function PilgrimageLayout() {
  // MapHostProvider keeps ONE Leaflet WebView alive beneath the whole stack so
  // the hub map's ~200KB parse + tile init happens once per session, not on
  // every navigation (CLAUDE.md Rule 10). It renders the WebView as the bottom
  // layer; the stack's screens paint on top. The `map` route makes its own
  // content background transparent (via its <Stack.Screen contentStyle>) so the
  // host shows through; every other route stays opaque and fully covers it.
  return (
    <MapHostProvider>
      <Stack
        screenOptions={{
          headerShown: false,
        }}
      />
    </MapHostProvider>
  );
}
