import { View } from 'react-native';

import type { LookAroundPreviewViewProps } from './LookAroundPreviewView.types';

export function LookAroundPreviewView({
  latitude: _latitude,
  longitude: _longitude,
  onSceneUnavailable: _onSceneUnavailable,
  ...viewProps
}: LookAroundPreviewViewProps) {
  return <View {...viewProps} />;
}
