import type { NativeSyntheticEvent, ViewProps } from 'react-native';

export interface LookAroundSceneUnavailablePayload {
  latitude: number;
  longitude: number;
}

export type LookAroundSceneUnavailableEvent =
  NativeSyntheticEvent<LookAroundSceneUnavailablePayload>;

export interface LookAroundPreviewViewProps extends ViewProps {
  latitude: number;
  longitude: number;
  onSceneUnavailable?: (event: LookAroundSceneUnavailableEvent) => void;
}
