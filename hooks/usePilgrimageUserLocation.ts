// usePilgrimageUserLocation — fetches and subscribes to the user's current
// position + compass heading for as long as the consumer is mounted. Split
// out so the route file isn't responsible for cancellation boilerplate.
//
// Returns:
//   location  — { latitude, longitude } or null when the OS hasn't granted
//               permission / can't deliver a fix. Updates as the device moves
//               (LocationService throttles at ~50m / 10s by default).
//   heading   — 0–360° bearing (0 = true north, clockwise) or null when no
//               compass is available. Rounded to whole degrees and gated on
//               a 3° delta to avoid pinging the WebView bridge on jitter.

import { useEffect, useRef, useState } from 'react';
import { locationService, type LatLng } from '../libs/services/pilgrimage/location-service';
import { sameLatLng } from '../libs/services/pilgrimage/pilgrimage-screen-state';

export interface UserLocationState {
  location: LatLng | null;
  heading: number | null;
}

export function usePilgrimageUserLocation(): UserLocationState {
  const [location, setLocation] = useState<LatLng | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const locationRef = useRef<LatLng | null>(null);

  useEffect(() => {
    let cancelled = false;
    locationService
      .getCurrentLocation()
      .then((loc) => {
        if (cancelled || !loc || sameLatLng(locationRef.current, loc)) return;
        locationRef.current = loc;
        setLocation(loc);
      })
      .catch(() => undefined);

    const unsubLoc = locationService.subscribeToUpdates((loc) => {
      if (cancelled || sameLatLng(locationRef.current, loc)) return;
      locationRef.current = loc;
      setLocation(loc);
    });

    let lastHeading = Number.NaN;
    const unsubHead = locationService.subscribeToHeading((deg) => {
      if (cancelled) return;
      const rounded = Math.round(deg);
      if (Number.isFinite(lastHeading) && Math.abs(rounded - lastHeading) < 3) return;
      lastHeading = rounded;
      setHeading((prev) => (prev === rounded ? prev : rounded));
    });

    return () => {
      cancelled = true;
      unsubLoc();
      unsubHead();
    };
  }, []);

  return { location, heading };
}
