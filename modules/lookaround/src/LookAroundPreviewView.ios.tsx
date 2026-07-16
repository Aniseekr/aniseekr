import { requireNativeViewManager } from 'expo-modules-core';
import type { ComponentType } from 'react';

import type { LookAroundPreviewViewProps } from './LookAroundPreviewView.types';

export const LookAroundPreviewView = requireNativeViewManager(
  'AniseekrLookAround',
  'LookAroundPreviewView'
) as ComponentType<LookAroundPreviewViewProps>;
