import { forwardRef, useImperativeHandle } from 'react';

export interface NativeAdCardRef {
  swipe: (direction: 'left' | 'right') => void;
}

interface Props {
  isTop?: boolean;
  onSwipe: (direction: 'left' | 'right') => void;
  activeTranslation?: unknown;
}

export const NativeAdCard = forwardRef<NativeAdCardRef, Props>(({ onSwipe }, ref) => {
  useImperativeHandle(
    ref,
    () => ({
      swipe: onSwipe,
    }),
    [onSwipe]
  );

  return null;
});

NativeAdCard.displayName = 'NativeAdCard';
