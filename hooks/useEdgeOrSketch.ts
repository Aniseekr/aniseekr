import type { SkImage } from '@shopify/react-native-skia';
import {
  useEdgeImage,
  useSketchImage,
  useSubjectImage,
} from '../libs/services/pilgrimage/edge-image-skia';
import { getEdgeOverlayConfig, type EdgeIntensity } from '../libs/services/pilgrimage/edge-overlay';
import {
  getSubjectOverlayConfig,
  type SubjectFocus,
} from '../libs/services/pilgrimage/subject-overlay';
import type { OverlayMode } from '../components/pilgrimage/camera/types';

interface UseEdgeOrSketchInput {
  mode: OverlayMode;
  hiResImageUrl: string;
  themeColor: string;
  edgeIntensity: EdgeIntensity;
  subjectFocus: SubjectFocus;
}

interface UseEdgeOrSketchOutput {
  image: SkImage | null;
  loading: boolean;
  error: Error | null;
  sourceOpacity: number;
}

export function useEdgeOrSketch({
  mode,
  hiResImageUrl,
  themeColor,
  edgeIntensity,
  subjectFocus,
}: UseEdgeOrSketchInput): UseEdgeOrSketchOutput {
  const edgeConfig = getEdgeOverlayConfig(edgeIntensity);
  const subjectConfig = getSubjectOverlayConfig(subjectFocus);
  const {
    edgeImage,
    loading: edgeLoading,
    error: edgeError,
  } = useEdgeImage(mode === 'edge' ? hiResImageUrl : null, {
    inkColor: themeColor,
    inkOpacity: edgeConfig.inkOpacity,
    threshold: edgeConfig.threshold,
  });
  const {
    sketchImage,
    loading: sketchLoading,
    error: sketchError,
  } = useSketchImage(mode === 'sketch' ? hiResImageUrl : null, {
    inkColor: '#1A1A1A',
    inkOpacity: 1,
  });
  const {
    subjectImage,
    loading: subjectLoading,
    error: subjectError,
  } = useSubjectImage(mode === 'subject' ? hiResImageUrl : null, subjectConfig);

  if (mode === 'edge') {
    return {
      image: edgeImage,
      loading: edgeLoading,
      error: edgeError,
      sourceOpacity: edgeConfig.sourceOpacity,
    };
  }
  if (mode === 'sketch') {
    return { image: sketchImage, loading: sketchLoading, error: sketchError, sourceOpacity: 0 };
  }
  if (mode === 'subject') {
    return { image: subjectImage, loading: subjectLoading, error: subjectError, sourceOpacity: 0 };
  }
  return { image: null, loading: false, error: null, sourceOpacity: 0 };
}
