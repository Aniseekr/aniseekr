import type { CameraType } from 'expo-camera';
import type { LatLng } from '../../../libs/services/pilgrimage/location-service';

export type { LatLng };

export type CameraFacing = CameraType;
export type FlashMode = 'off' | 'on' | 'auto' | 'torch';
export type OverlayMode = 'anime' | 'sketch' | 'edge' | 'subject';
export type AspectRatio = '4:3' | '16:9' | '1:1' | 'full';
export type ChipKind = 'overlay' | 'flash' | 'exposure' | 'aspect';
export type FocalStop = 0.5 | 1 | 2 | 3;
export type ZoomValue = number;

export interface AlignmentScoreView {
  total: number | null;
  distanceMeters: number | null;
  headingDeltaDeg: number | null;
  tiltDeg: number | null;
}

export interface FocusPoint {
  x: number;
  y: number;
  createdAt: number;
}

export interface OverlayTransformValues {
  scale: number;
  translateX: number;
  translateY: number;
  rotationRad: number;
  flipScaleX: -1 | 1;
}

export interface CameraSearchParams {
  spotId: string;
  imageUrl: string;
  name: string;
  ep: string;
  animeId: string;
  animeTitle?: string;
  themeColor: string;
  spotLat: string;
  spotLng: string;
}
