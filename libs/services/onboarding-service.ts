import { kvGet, kvRemove, kvSet, migrateToMMKV } from './storage/app-storage';
import { ONBOARDING_COMPLETE_KEY } from './storage/keys';
import { Logger } from '../utils/logger';

export { ONBOARDING_COMPLETE_KEY };

export async function isOnboardingComplete(): Promise<boolean> {
  try {
    await migrateToMMKV();
    return kvGet(ONBOARDING_COMPLETE_KEY) === 'true';
  } catch (err) {
    Logger.warn('[Onboarding] read flag failed', err);
    return false;
  }
}

export async function markOnboardingComplete(): Promise<void> {
  try {
    kvSet(ONBOARDING_COMPLETE_KEY, 'true');
  } catch (err) {
    Logger.warn('[Onboarding] write flag failed', err);
  }
}

export async function resetOnboarding(): Promise<void> {
  try {
    kvRemove(ONBOARDING_COMPLETE_KEY);
  } catch (err) {
    Logger.warn('[Onboarding] reset flag failed', err);
  }
}
