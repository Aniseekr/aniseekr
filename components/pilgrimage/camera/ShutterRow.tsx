import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { bottomPad } from '../../../constants/DesignSystem';
import { hapticsBridge } from '../../../modules/haptics/hapticsBridge';
import { ThemedText } from '../../themed';

interface ShutterRowProps {
  themeColor: string;
  referenceImageUrl: string;
  capturing: boolean;
  isLandscape: boolean;
  bottomInset: number;
  onShutter: () => void;
  onOpenMap: () => void;
  onPickReference: () => void;
}

export default function ShutterRow({
  themeColor,
  referenceImageUrl,
  capturing,
  isLandscape,
  bottomInset,
  onShutter,
  onOpenMap,
  onPickReference,
}: ShutterRowProps) {
  const handleShutterPress = () => {
    if (capturing) return;
    hapticsBridge.success();
    onShutter();
  };

  const handleMapPress = () => {
    hapticsBridge.tap();
    onOpenMap();
  };

  const handleReferencePress = () => {
    hapticsBridge.tap();
    onPickReference();
  };

  return (
    <View
      style={[
        styles.bottomBar,
        isLandscape ? styles.bottomBarLandscape : null,
        { paddingBottom: bottomPad({ bottom: bottomInset }) + (isLandscape ? 0 : 4) },
      ]}>
      <LinearGradient
        // rgba scrim sits over the live camera preview — no theme surface below.
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.78)']}
        style={StyleSheet.absoluteFill}
      />
      {isLandscape ? (
        <View style={styles.bottomRowLandscape}>
          <View style={styles.bottomClusterLeft}>
            <ThumbnailBtn kind="map" themeColor={themeColor} onPress={handleMapPress} />
          </View>

          <Pressable
            onPress={handleShutterPress}
            disabled={capturing}
            accessibilityRole="button"
            accessibilityLabel="Take comparison photo"
            style={({ pressed }) => [
              styles.shutterOuter,
              styles.shutterOuterLandscape,
              { borderColor: themeColor },
              pressed && { opacity: 0.85 },
              capturing && { opacity: 0.6 },
            ]}>
            {capturing ? (
              <ActivityIndicator size="small" color={themeColor} />
            ) : (
              <View
                style={[
                  styles.shutterInner,
                  styles.shutterInnerLandscape,
                  { backgroundColor: themeColor },
                ]}
              />
            )}
          </Pressable>

          <ThumbnailBtn
            kind="reference"
            themeColor={themeColor}
            imageUrl={referenceImageUrl}
            onPress={handleReferencePress}
          />
        </View>
      ) : (
        <View style={styles.bottomRow}>
          <ThumbnailBtn kind="map" themeColor={themeColor} onPress={handleMapPress} />

          <View style={styles.shutterColumn}>
            <Pressable
              onPress={handleShutterPress}
              disabled={capturing}
              accessibilityRole="button"
              accessibilityLabel="Take comparison photo"
              style={({ pressed }) => [
                styles.shutterOuter,
                { borderColor: themeColor },
                pressed && { opacity: 0.85 },
                capturing && { opacity: 0.6 },
              ]}>
              {capturing ? (
                <ActivityIndicator size="small" color={themeColor} />
              ) : (
                <View style={[styles.shutterInner, { backgroundColor: themeColor }]} />
              )}
            </Pressable>
            <ThemedText
              variant="captionSmall"
              weight="700"
              align="center"
              style={{ color: 'rgba(255,255,255,0.6)', marginTop: 6, letterSpacing: 1 }}>
              PHOTO
            </ThemedText>
          </View>

          <ThumbnailBtn
            kind="reference"
            themeColor={themeColor}
            imageUrl={referenceImageUrl}
            onPress={handleReferencePress}
          />
        </View>
      )}
    </View>
  );
}

function ThumbnailBtn({
  kind,
  imageUrl,
  themeColor,
  onPress,
}: {
  kind: 'map' | 'reference';
  imageUrl?: string;
  themeColor: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={kind === 'map' ? 'Open map' : 'Show anime reference'}
      style={({ pressed }) => [
        styles.thumbBtn,
        {
          borderColor: kind === 'map' ? themeColor : 'rgba(255,255,255,0.28)',
          opacity: pressed ? 0.7 : 1,
        },
      ]}>
      {kind === 'reference' && imageUrl ? (
        <Image
          source={{ uri: imageUrl }}
          style={styles.thumbImage}
          contentFit="cover"
          transition={120}
        />
      ) : (
        <View style={[styles.thumbMap, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
          <Ionicons name="map" size={18} color={themeColor} />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 18,
    paddingTop: 24,
  },
  bottomBarLandscape: {
    paddingHorizontal: 18,
    paddingTop: 14,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  bottomRowLandscape: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    gap: 12,
  },
  bottomClusterLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  shutterColumn: {
    alignItems: 'center',
  },
  shutterOuter: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterOuterLandscape: {
    width: 66,
    height: 66,
    borderRadius: 33,
    borderWidth: 3,
  },
  shutterInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  shutterInnerLandscape: {
    width: 46,
    height: 46,
    borderRadius: 23,
  },
  thumbBtn: {
    width: 56,
    height: 56,
    borderRadius: 12,
    borderWidth: 2,
    overflow: 'hidden',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  thumbMap: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
