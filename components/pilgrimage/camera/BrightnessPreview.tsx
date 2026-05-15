import { StyleSheet, View } from 'react-native';

interface BrightnessPreviewProps {
  overlayStyle: { backgroundColor: string; opacity: number };
}

export default function BrightnessPreview({ overlayStyle }: BrightnessPreviewProps) {
  if (overlayStyle.opacity === 0) return null;
  return (
    <View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        { backgroundColor: overlayStyle.backgroundColor, opacity: overlayStyle.opacity },
      ]}
    />
  );
}
