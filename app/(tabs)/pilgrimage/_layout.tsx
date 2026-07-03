import { useEffect } from 'react';
import { Stack } from 'expo-router';

import { hydratePilgrimageHubSnapshotFromCache } from '../../../libs/services/pilgrimage/pilgrimage-hub-cache';

export default function PilgrimageLayout() {
  // The hub map renders its own native <MapSurface> inline (see map.tsx). A
  // native map inside the screen is hidden correctly by the navigator when
  // covered and stays warm while the hub sits under a pushed detail screen, so
  // no shared keep-alive host is needed. A native map inside the screen stays
  // warm under pushed detail screens, and portal-based GL surfaces can bleed
  // through opacity gates on back-navigation.
  useEffect(() => {
    // Warm the module snapshot from SQLite before the hub / map screen reads
    // it synchronously (CLAUDE.md Rule 10 — silent upgrade, never a skeleton).
    hydratePilgrimageHubSnapshotFromCache().catch(() => undefined);
  }, []);
  return <Stack screenOptions={{ headerShown: false }} />;
}
