// Skia-backed hook: decode a reference image natively, downscale to 64×64,
// read RGBA bytes, and reduce them to a SceneAnalysis. No WebView, no JPEG
// JS-decoder, no hash-seeded fallback — if decoding fails the caller gets
// { analysis: null, error: 'reason' } and the UI must show a real error state.

import { useEffect, useState } from 'react';
import { type SceneAnalysis } from '../../libs/services/pilgrimage/scene-analysis';
import { analyzeImage } from '../../libs/services/pilgrimage/scene-analysis-skia';

export type SceneAnalysisStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface UseSceneAnalysisResult {
  status: SceneAnalysisStatus;
  analysis: SceneAnalysis | null;
}

export function useSceneAnalysis(imageUrl: string | undefined): UseSceneAnalysisResult {
  const [analysis, setAnalysis] = useState<SceneAnalysis | null>(null);
  const [status, setStatus] = useState<SceneAnalysisStatus>('idle');

  useEffect(() => {
    if (!imageUrl) {
      setAnalysis(null);
      setStatus('idle');
      return;
    }
    let cancelled = false;
    setStatus('loading');
    setAnalysis(null);
    analyzeImage(imageUrl)
      .then((result) => {
        if (cancelled) return;
        if (result) {
          setAnalysis(result);
          setStatus('ready');
        } else {
          setAnalysis(null);
          setStatus('error');
        }
      })
      .catch(() => {
        if (cancelled) return;
        setAnalysis(null);
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  return { status, analysis };
}
