import {
  Easing,
  FadeInDown,
  FadeInUp,
  FadeOutDown,
  FadeOutUp,
  Layout,
  ZoomIn,
  ZoomOut,
} from 'react-native-reanimated';

export const Springs = {
  press: { damping: 14, stiffness: 320 },
  focus: { damping: 20, stiffness: 220, mass: 0.6 },
  sheet: { damping: 20, stiffness: 220, mass: 0.9 },
} as const;

export const sheetEnter = () => FadeInUp.duration(260).easing(Easing.out(Easing.cubic));

export const overlayEnter = () => FadeInUp.duration(220).easing(Easing.out(Easing.cubic));

export const overlayExit = () => FadeOutDown.duration(180);

export const overlayLayout = () => Layout.duration(150);

export const fabEnter = () => ZoomIn.duration(220).easing(Easing.out(Easing.cubic));

export const fabExit = () => ZoomOut.duration(160);

export const bannerEnter = () => FadeInDown.duration(240).easing(Easing.out(Easing.cubic));

export const bannerExit = () => FadeOutUp.duration(180);

export const toastEnter = () => FadeInUp.duration(200);

export const toastExit = () => FadeOutDown.duration(160);

export const listItemEnter = (index: number, stagger = 40) =>
  FadeInUp.delay(index * stagger)
    .duration(280)
    .easing(Easing.out(Easing.cubic));

export const listItemEnterDown = (index: number, stagger = 40) =>
  FadeInDown.delay(index * stagger)
    .duration(280)
    .easing(Easing.out(Easing.cubic));
