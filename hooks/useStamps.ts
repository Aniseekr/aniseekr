// Spot stamps for screens that list them (stamp books, footprint map). Reads
// the on-device records synchronously for frame 1, re-reads on focus, and asks
// Atlas once for the work / municipality of check-ins made before stamps existed.
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import { atlasClient } from '@/libs/services/pilgrimage/atlas/atlas-client';
import type { AtlasWork } from '@/libs/services/pilgrimage/atlas/types';
import { backfillStampMeta } from '@/libs/services/pilgrimage/stamp-backfill';
import type { Stamp } from '@/libs/services/pilgrimage/stamp-details';
import { loadStampsSync } from '@/libs/services/pilgrimage/visited-prefs';

export function useStamps(): Stamp[] {
  const [stamps, setStamps] = useState<Stamp[]>(loadStampsSync);
  useFocusEffect(useCallback(() => setStamps(loadStampsSync()), []));
  useEffect(() => {
    let cancelled = false;
    void backfillStampMeta().then((written) => {
      if (!cancelled && written > 0) setStamps(loadStampsSync());
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return stamps;
}

/** Atlas work rows by key, for titles and covers. Empty until the index resolves. */
export function useAtlasWorkMap(): ReadonlyMap<string, AtlasWork> {
  const [works, setWorks] = useState<ReadonlyMap<string, AtlasWork>>(new Map());
  useEffect(() => {
    let cancelled = false;
    atlasClient
      .works()
      .then((index) => {
        if (!cancelled) setWorks(new Map(index.works.map((work) => [work.key, work])));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  return works;
}

/** Route to a work's stamp book, carrying the title and cover for frame 1. */
export function stampBookRoute(workKey: string, title: string, work: AtlasWork | undefined) {
  const bgm = work?.bgm?.[0];
  return {
    pathname: '/pilgrimage/stampbook/[workKey]',
    params: {
      workKey,
      title,
      ...(bgm ? { poster: `https://api.bgm.tv/v0/subjects/${bgm}/image?type=common` } : {}),
    },
  } as const;
}
