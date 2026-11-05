// 紀錄 mode for the camera screen: file each shot in the journal, confirm it,
// keep a camera-roll copy, and open the newest shot from the gallery thumb.
// The screen only decides *when* (shutter in 紀錄 mode); this hook owns *how*.
import { useCallback } from 'react';
import { useRouter } from 'expo-router';
// The root export throws for these since SDK 56; the legacy entry keeps them.
import * as MediaLibrary from 'expo-media-library/legacy';

import { useT } from '../libs/i18n';
import { hapticsBridge } from '../modules/haptics/hapticsBridge';
import { findCaptureByUri, loadCapturesV2Sync } from '../libs/services/pilgrimage/captures';
import type { CaptureSessionShot } from '../libs/services/pilgrimage/capture-session';
import { locationService } from '../libs/services/pilgrimage/location-service';
import type { PhotoImportSummary } from '../libs/services/pilgrimage/photo-import';
import { usePhotoImport } from './usePhotoImport';
import { buildJournalPreviewParams } from '../libs/services/pilgrimage/preview-capture';
import {
  fileRecordedPhoto,
  metadataReady,
  type RecordTarget,
} from '../libs/services/pilgrimage/record-capture';
import type { CamSwitchToastValue } from '../components/pilgrimage/camera/CamSwitchToast';

interface UseRecordCaptureInput {
  /** The spot the camera was opened for, if any. */
  target: RecordTarget | null;
  themeColor: string;
  showToast: (toast: CamSwitchToastValue) => void;
}

export function useRecordCapture({ target, themeColor, showToast }: UseRecordCaptureInput) {
  const t = useT();
  const router = useRouter();
  // Save-only access: READ_MEDIA_IMAGES is blocked in app.json, so asking to
  // read would throw on Android 13+.
  const [mediaPerm, requestMediaPerm] = MediaLibrary.usePermissions({
    writeOnly: true,
    granularPermissions: ['photo'],
  });

  const record = useCallback(
    async (shot: CaptureSessionShot) => {
      const location =
        shot.userLocation ?? (await locationService.getCurrentLocation().catch(() => null));
      let filed;
      try {
        filed = await fileRecordedPhoto(
          {
            uri: shot.uri,
            capturedAt: shot.createdAt,
            source: shot.source === 'auto' ? 'auto' : 'camera',
            heading: shot.heading,
            location: location
              ? { latitude: location.latitude, longitude: location.longitude }
              : null,
          },
          target
        );
      } catch (error) {
        console.warn('[camera] record to journal failed', error);
        hapticsBridge.error();
        return;
      }
      hapticsBridge.success();
      showToast({
        icon: 'checkmark-circle',
        label: t('pilgrimageUi.camera.recorded'),
        ...(filed.spotName ? { hint: filed.spotName } : {}),
      });
      // The camera-roll copy is a convenience: after the confirmation, and
      // only once the EXIF rewrite of this file has finished.
      await metadataReady(shot.uri);
      const granted = mediaPerm?.granted || (await requestMediaPerm().catch(() => null))?.granted;
      if (granted) await MediaLibrary.saveToLibraryAsync(shot.uri).catch(() => undefined);
    },
    [target, mediaPerm, requestMediaPerm, showToast, t]
  );

  /** Open the newest logged shot (view, save, share). Returns false when there is none. */
  const openLatest = useCallback(
    (latest: CaptureSessionShot | null): boolean => {
      const capture = latest ? findCaptureByUri(latest.uri) : null;
      if (!capture) return false;
      const isFree = loadCapturesV2Sync().free.some((c) => c.uri === capture.uri);
      router.push({
        pathname: '/compare/preview',
        params: buildJournalPreviewParams(
          { capture, spot: null, anime: null, matchPercent: null, isFree },
          {
            importedLabel: t('pilgrimageUi.referencePicker.importedLabel'),
            fallbackColor: themeColor,
          }
        ),
      });
      return true;
    },
    [router, t, themeColor]
  );

  /**
   * Import from the library the way the journal does: each photo keeps its own
   * time and place (never the phone's current position). Confirms in a toast.
   */
  const showImportSummary = useCallback(
    (summary: PhotoImportSummary) => {
      hapticsBridge.success();
      const works = summary.works.map((work) => work.title).join('、');
      showToast({
        icon: 'images-outline',
        label:
          summary.imported > 0
            ? t('pilgrimage.album.importResultTitle', { count: summary.imported })
            : t('pilgrimage.album.importDuplicates', { count: summary.duplicates }),
        ...(works
          ? { hint: works }
          : summary.noPlace > 0
            ? { hint: t('pilgrimage.album.importNoPlace', { count: summary.noPlace }) }
            : {}),
      });
    },
    [showToast, t]
  );
  const photoImport = usePhotoImport({
    origin: 'camera',
    onSummary: showImportSummary,
    onError: useCallback(
      (error: unknown) => {
        console.warn('[camera] library import failed', error);
        hapticsBridge.error();
        showToast({ icon: 'alert-circle', label: t('pilgrimage.album.importFailed') });
      },
      [showToast, t]
    ),
  });
  const importFromLibrary = photoImport.start;

  return { record, openLatest, importFromLibrary };
}
