import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';

import {
  getLocalityEventListRows,
  type LocalityEventListRow,
} from '@/libs/services/pilgrimage/locality/event-detail';
import { localityRepository } from '@/libs/services/pilgrimage/locality/locality-repository';

import {
  loadStampCollectedAtSync,
  sameCollectedAt,
  type StampCollectedAtMap,
} from './rally-format';

function subscribeLocality(listener: () => void): () => void {
  return localityRepository.subscribe(listener);
}

function getLocalitySnapshot() {
  return localityRepository.getSnapshot();
}

function localDayKey(date = new Date()): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

/**
 * Shared inputs for the Discover rally rail and the Journal stamp book: event rows
 * (re-evaluated when the locality snapshot changes or the day rolls over) and the
 * stamp-time map. Both are synchronous on first paint and refreshed silently on
 * focus; tabs stay mounted, so focus is where stamps from the rally page and a
 * new day show up.
 */
export function useStampRallyRows(): {
  rows: readonly LocalityEventListRow[];
  collectedAt: StampCollectedAtMap;
} {
  const snapshot = useSyncExternalStore(
    subscribeLocality,
    getLocalitySnapshot,
    getLocalitySnapshot
  );
  const [collectedAt, setCollectedAt] = useState<StampCollectedAtMap>(loadStampCollectedAtSync);
  const [dayKey, setDayKey] = useState(localDayKey);

  useFocusEffect(
    useCallback(() => {
      const latest = loadStampCollectedAtSync();
      setCollectedAt((current) => (sameCollectedAt(current, latest) ? current : latest));
      setDayKey(localDayKey());
    }, [])
  );

  const rows = useMemo(() => {
    void snapshot;
    void dayKey;
    return getLocalityEventListRows(new Date(), localityRepository);
  }, [snapshot, dayKey]);

  return { rows, collectedAt };
}
