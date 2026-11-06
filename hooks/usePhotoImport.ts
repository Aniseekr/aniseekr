// Starting a photo import, the same from the journal and the camera:
//   free → pick one photo, save it, report.
//   Pro  → pick many; more than one goes to the review screen first, and its
//          result comes back here when this screen regains focus.
import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSubscription } from '../context/SubscriptionContext';
import {
  commitPhotoImport,
  MAX_IMPORT_PHOTOS,
  pickImportPhotos,
  planPhotoImport,
  type PhotoImportSummary,
} from '../libs/services/pilgrimage/photo-import';
import {
  setPendingImport,
  takeFinishedImport,
} from '../libs/services/pilgrimage/import-review-store';

interface UsePhotoImportInput {
  /** Who started the import; the review's result returns only to this origin. */
  origin: 'journal' | 'camera';
  onSummary: (summary: PhotoImportSummary) => void;
  onError: (error: unknown) => void;
}

export function usePhotoImport({ origin, onSummary, onError }: UsePhotoImportInput) {
  const router = useRouter();
  const { isPro } = useSubscription();
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const onSummaryRef = useRef(onSummary);
  onSummaryRef.current = onSummary;

  useFocusEffect(
    useCallback(() => {
      const summary = takeFinishedImport(origin);
      if (summary) onSummaryRef.current(summary);
    }, [origin])
  );

  const start = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const picked = await pickImportPhotos(isPro ? MAX_IMPORT_PHOTOS : 1);
      if (picked.length === 0) return;
      const plan = await planPhotoImport(picked);
      if (plan.length === 1) {
        onSummaryRef.current(await commitPhotoImport(plan));
        return;
      }
      setPendingImport(plan, origin);
      router.push('/import-review');
    } catch (error) {
      onError(error);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [isPro, onError, origin, router]);

  return { start, busy, isPro };
}
