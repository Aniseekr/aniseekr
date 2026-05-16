import { Logger } from '../../utils/logger';

interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

let AsyncStorage: AsyncStorageLike;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  AsyncStorage = require('@react-native-async-storage/async-storage').default;
} catch {
  const memory = new Map<string, string>();
  AsyncStorage = {
    getItem: async (key) => memory.get(key) ?? null,
    setItem: async (key, value) => {
      memory.set(key, value);
    },
  };
}

export const SPOT_INTENTS_STORAGE_KEY = 'aniseekr.pilgrimage.spot-intents.v1';

export type SpotIntentKind = 'saved' | 'planned';

export interface SpotIntent {
  saved?: true;
  planned?: true;
}

export type SpotIntentMap = Record<string, SpotIntent>;

export async function loadSpotIntents(): Promise<SpotIntentMap> {
  try {
    const raw = await AsyncStorage.getItem(SPOT_INTENTS_STORAGE_KEY);
    if (!raw) return {};
    return sanitizeSpotIntents(JSON.parse(raw) as unknown);
  } catch (err) {
    Logger.warn('[SpotIntents] load failed, returning empty', err);
    return {};
  }
}

export async function saveSpotIntents(map: SpotIntentMap): Promise<void> {
  try {
    await AsyncStorage.setItem(SPOT_INTENTS_STORAGE_KEY, JSON.stringify(sanitizeSpotIntents(map)));
  } catch (err) {
    Logger.warn('[SpotIntents] save failed', err);
  }
}

export function toggleSpotIntent(
  map: SpotIntentMap,
  spotId: string,
  intent: SpotIntentKind
): SpotIntentMap {
  const current = map[spotId] ?? {};
  const nextIntent: SpotIntent = { ...current };
  if (nextIntent[intent]) delete nextIntent[intent];
  else nextIntent[intent] = true;

  const next: SpotIntentMap = { ...map };
  if (nextIntent.saved || nextIntent.planned) next[spotId] = nextIntent;
  else delete next[spotId];
  return next;
}

function sanitizeSpotIntents(value: unknown): SpotIntentMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: SpotIntentMap = {};
  for (const [spotId, rawIntent] of Object.entries(value as Record<string, unknown>)) {
    if (!spotId || !rawIntent || typeof rawIntent !== 'object' || Array.isArray(rawIntent)) {
      continue;
    }
    const source = rawIntent as Record<string, unknown>;
    const intent: SpotIntent = {};
    if (source.saved === true) intent.saved = true;
    if (source.planned === true) intent.planned = true;
    if (intent.saved || intent.planned) out[spotId] = intent;
  }
  return out;
}
