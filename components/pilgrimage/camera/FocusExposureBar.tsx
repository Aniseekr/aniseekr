import { StyleSheet, View } from 'react-native';
import Slider from '@react-native-community/slider';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ThemedText } from '../../themed';
import { useT } from '../../../libs/i18n';
import { roundExposureValue } from '../../../libs/services/pilgrimage/camera-ui';

interface FocusExposureBarProps {
  value: number;
  themeColor: string;
  bottomOffset: number;
  isLandscape: boolean;
  onChange: (next: number) => void;
}

function formatEV(value: number): string {
  if (value === 0) return 'EV 0';
  return value > 0 ? `EV +${value.toFixed(1)}` : `EV ${value.toFixed(1)}`;
}

export default function FocusExposureBar({
  value,
  themeColor,
  bottomOffset,
  isLandscape,
  onChange,
}: FocusExposureBarProps) {
  const t = useT();
  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.root,
        {
          bottom: bottomOffset,
          left: isLandscape ? '18%' : 16,
          right: isLandscape ? '18%' : 16,
        },
      ]}>
      <View style={styles.bar}>
        <View style={[styles.lockPill, { borderColor: themeColor }]}>
          <Ionicons name="scan-outline" size={14} color={themeColor} />
          <ThemedText variant="captionSmall" weight="700" style={styles.lockText}>
            {t('pilgrimageUi.afLock')}
          </ThemedText>
        </View>
        <Slider
          style={styles.slider}
          minimumValue={-2}
          maximumValue={2}
          step={0.1}
          value={value}
          onValueChange={(next) => onChange(roundExposureValue(next))}
          minimumTrackTintColor={themeColor}
          maximumTrackTintColor="rgba(255,255,255,0.28)"
          thumbTintColor="#fff"
          accessibilityLabel={t('pilgrimageUi.adjustLockedFocusExposure')}
          accessibilityValue={{ min: -2, max: 2, now: value }}
        />
        <ThemedText variant="caption" weight="700" align="right" style={styles.valueText}>
          {formatEV(value)}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    alignItems: 'center',
  },
  bar: {
    width: '100%',
    maxWidth: 560,
    minHeight: 54,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(0,0,0,0.66)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
  },
  lockPill: {
    minHeight: 34,
    minWidth: 82,
    borderRadius: 17,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  lockText: {
    color: '#fff',
  },
  slider: {
    flex: 1,
    minWidth: 120,
    height: 38,
  },
  valueText: {
    width: 58,
    color: '#fff',
  },
});
