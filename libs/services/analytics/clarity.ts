import { Platform } from 'react-native';
import { onColdStartReported } from '../perf/startup-trace';

const CLARITY_PROJECT_ID = process.env.EXPO_PUBLIC_CLARITY_PROJECT_ID?.trim() || 'u8mefiww5z';

let initialized = false;

export function initClarity(): void {
  if (initialized) return;
  if (Platform.OS === 'web') return;
  if (!CLARITY_PROJECT_ID) return;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Clarity = require('react-native-clarity') as typeof import('react-native-clarity');
    Clarity.initialize(CLARITY_PROJECT_ID, {
      logLevel: __DEV__ ? Clarity.LogLevel.Warning : Clarity.LogLevel.None,
    });
    initialized = true;

    // Forward the measured cold-start TTI as a session tag so launches can
    // be segmented by startup speed in the Clarity dashboard. The listener
    // fires immediately when the summary landed before analytics init (the
    // usual order — Rule 10 defers initClarity past the first interactive
    // frame) and right after the measurement otherwise. Real cold starts
    // only; startup-trace reports nothing for warm resumes and reloads.
    onColdStartReported((summary) => {
      void Clarity.setCustomTag('coldStartTtiMs', String(Math.round(summary.ttiMs))).catch(
        () => undefined
      );
    });
  } catch (error) {
    console.warn('[clarity] init failed', error);
  }
}
