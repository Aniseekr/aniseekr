import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { hapticsBridge } from '../modules/haptics/hapticsBridge';
import { useT } from '../libs/i18n';
import {
  clearCapture,
  clearFreeCapture,
  loadCapturesV2Sync,
  type CapturesIndexV2,
  type PilgrimageCapture,
} from '../libs/services/pilgrimage/captures';
import { pilgrimageRepository } from '../libs/services/pilgrimage/pilgrimage-repository';
import { collectionPilgrimageService } from '../libs/services/pilgrimage/collection-pilgrimage-service';
import { FEATURED_PILGRIMAGE_ANIME } from '../libs/services/pilgrimage/featured-anime';
import {
  buildPilgrimageAlbumEntries,
  type PilgrimageAlbumEntry,
} from '../libs/services/pilgrimage/album-captures';
import {
  getPilgrimageAnimeTitles,
  getPilgrimageSpotTitles,
} from '../libs/services/pilgrimage/pilgrimage-localization';
import {
  releaseImportedPhoto,
  releaseImportedReference,
} from '../libs/services/pilgrimage/reference-image';
import type { PilgrimageWork } from '../libs/services/pilgrimage/types';
import { buildStampBooks } from '../libs/services/pilgrimage/locality/stamp-rally';
import { useStampRallyRows } from '../components/pilgrimage/rally/useStampRallyRows';

export interface JournalFolder {
  key: string;
  anime: PilgrimageWork | null;
  title: string;
  entries: PilgrimageAlbumEntry[];
  lastCapturedAt: number;
  visitedSpots: number;
}

function mergeWorks(prev: PilgrimageWork[], next: PilgrimageWork[]): PilgrimageWork[] {
  const missing = next.filter((work) => !prev.some((known) => known.key === work.key));
  return missing.length ? [...prev, ...missing] : prev;
}

export function usePilgrimageJournalData() {
  const t = useT();
  // MMKV seed keeps the first frame populated for a warm Journal tab.
  const [capturesV2, setCapturesV2] = useState<CapturesIndexV2>(loadCapturesV2Sync);
  const [animes, setAnimes] = useState<PilgrimageWork[]>([]);
  const { rows, collectedAt } = useStampRallyRows();

  useFocusEffect(useCallback(() => setCapturesV2(loadCapturesV2Sync()), []));

  useEffect(() => {
    let cancelled = false;
    async function loadAnimeIndex() {
      const byKey = new Map<string, PilgrimageWork>();
      try {
        for (const entry of await collectionPilgrimageService.getEntries()) {
          byKey.set(entry.anime.key, entry.anime);
        }
      } catch (error) {
        console.warn('[PilgrimageAlbum] collection anime load failed:', error);
      }
      const featured = await Promise.allSettled(
        FEATURED_PILGRIMAGE_ANIME.map(({ bangumiId }) =>
          pilgrimageRepository.getSpotsByBangumiId(bangumiId)
        )
      );
      for (const result of featured) {
        if (result.status === 'fulfilled' && result.value) byKey.set(result.value.key, result.value);
      }
      if (!cancelled) setAnimes((prev) => mergeWorks(prev, [...byKey.values()]));
    }
    void loadAnimeIndex();
    return () => {
      cancelled = true;
    };
  }, []);

  // Shots matched to a spot by place (photo import, 紀錄 near a spot) can belong
  // to a work outside the collection; load those works so they get a folder.
  const placeMatchedWorks = useMemo(() => {
    const keys = new Set<string>();
    for (const shots of Object.values(capturesV2.spots)) {
      for (const shot of shots) if (shot.workKey) keys.add(shot.workKey);
    }
    return [...keys].sort().join('|');
  }, [capturesV2]);
  useEffect(() => {
    if (!placeMatchedWorks) return;
    let cancelled = false;
    void Promise.allSettled(
      placeMatchedWorks.split('|').map((key) => pilgrimageRepository.getSpotsByKey(key))
    ).then((results) => {
      const works = results.flatMap((r) => (r.status === 'fulfilled' && r.value ? [r.value] : []));
      if (!cancelled && works.length) setAnimes((prev) => mergeWorks(prev, works));
    });
    return () => {
      cancelled = true;
    };
  }, [placeMatchedWorks]);

  const entries = useMemo(() => {
    const captures: PilgrimageCapture[] = [];
    for (const shots of Object.values(capturesV2.spots)) captures.push(...shots);
    return buildPilgrimageAlbumEntries({ captures, free: capturesV2.free, animes });
  }, [capturesV2, animes]);

  const folders = useMemo(() => {
    const byId = new Map<string, JournalFolder>();
    for (const entry of entries) {
      const key = entry.anime?.key ?? (entry.isFree ? 'free' : `legacy:${entry.capture.animeId ?? 'unknown'}`);
      const existing = byId.get(key);
      if (existing) {
        existing.entries.push(entry);
        existing.lastCapturedAt = Math.max(existing.lastCapturedAt, entry.capture.capturedAt);
      } else {
        byId.set(key, {
          key,
          anime: entry.anime,
          title: entry.anime
            ? getPilgrimageAnimeTitles(entry.anime).primary
            : entry.isFree
              ? t('pilgrimage.album.freeCapturesFolder')
              : t('pilgrimage.album.oldSpot'),
          entries: [entry],
          lastCapturedAt: entry.capture.capturedAt,
          visitedSpots: 0,
        });
      }
    }
    for (const folder of byId.values()) {
      folder.entries.sort((a, b) => b.capture.capturedAt - a.capture.capturedAt);
      folder.visitedSpots =
        folder.key === 'free' || folder.anime === null
          ? 0
          : new Set(folder.entries.flatMap((entry) => entry.spot ? [entry.spot.id] : [])).size;
    }
    return [...byId.values()].sort((a, b) => b.lastCapturedAt - a.lastCapturedAt);
  }, [entries, t]);

  const stats = useMemo(
    () => ({
      visited: folders.reduce((total, folder) => total + folder.visitedSpots, 0),
      photos: folders.reduce((total, folder) => total + folder.entries.length, 0),
      stamps: buildStampBooks(rows, (roleId) =>
        roleId in collectedAt ? (collectedAt[roleId] ?? 0) : null
      ).reduce((total, book) => total + book.collected, 0),
    }),
    [folders, rows, collectedAt]
  );

  const deleteEntry = useCallback(
    (entry: PilgrimageAlbumEntry) => {
      hapticsBridge.warning();
      Alert.alert(
        t('pilgrimage.album.deleteTitle'),
        t('pilgrimage.album.deleteBody', {
          title: entry.isFree
            ? t('pilgrimage.album.freeCapturesFolder')
            : entry.spot
              ? getPilgrimageSpotTitles(entry.spot).primary
              : t('pilgrimage.album.oldSpot'),
        }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('pilgrimage.album.deleteConfirm'),
            style: 'destructive',
            onPress: () => {
              const { spotId, uri } = entry.capture;
              setCapturesV2((prev) => {
                if (entry.isFree)
                  return { spots: prev.spots, free: prev.free.filter((c) => c.uri !== uri) };
                const shots = prev.spots[spotId];
                if (!shots) return prev;
                const filtered = shots.filter((c) => c.uri !== uri);
                const spots = { ...prev.spots };
                if (filtered.length) spots[spotId] = filtered;
                else delete spots[spotId];
                return { spots, free: prev.free };
              });
              void (entry.isFree ? clearFreeCapture(uri) : clearCapture(spotId, uri))
                .then(() => {
                  releaseImportedPhoto(uri);
                  if (entry.capture.referenceUri)
                    releaseImportedReference(entry.capture.referenceUri);
                })
                .catch((error) => console.warn('[PilgrimageAlbum] delete failed:', error));
            },
          },
        ]
      );
    },
    [t]
  );

  const reload = useCallback(() => setCapturesV2(loadCapturesV2Sync()), []);

  return { entries, folders, stats, deleteEntry, reload };
}
