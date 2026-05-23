import { describe, expect, it } from 'bun:test';

import {
  canNavigateFromRootLayout,
  resolveOnboardingGate,
  shouldRedirectToOnboarding,
} from '../../libs/navigation/root-layout-navigation';

describe('root layout navigation guards', () => {
  it('does not navigate before the root navigator has mounted', () => {
    expect(canNavigateFromRootLayout(false)).toBe(false);
    expect(
      shouldRedirectToOnboarding({
        rootNavigationReady: false,
        onboardingComplete: false,
        pathname: '/',
      })
    ).toBe(false);
  });

  it('does not redirect from root state alone until the navigation container is ready', () => {
    expect(
      shouldRedirectToOnboarding({
        rootNavigationReady: false,
        onboardingComplete: false,
        pathname: '/',
      })
    ).toBe(false);
  });

  it('redirects incomplete onboarding only after the navigation container is ready', () => {
    expect(
      shouldRedirectToOnboarding({
        rootNavigationReady: true,
        onboardingComplete: false,
        pathname: '/',
      })
    ).toBe(true);
  });

  it('does not redirect when onboarding is done or already on onboarding', () => {
    expect(
      shouldRedirectToOnboarding({
        rootNavigationReady: true,
        onboardingComplete: true,
        pathname: '/',
      })
    ).toBe(false);
    expect(
      shouldRedirectToOnboarding({
        rootNavigationReady: true,
        onboardingComplete: false,
        pathname: '/onboarding',
      })
    ).toBe(false);
  });

  it('consumes the bootstrap gate once root navigation is ready even when already on onboarding', () => {
    expect(
      resolveOnboardingGate({
        rootNavigationReady: true,
        onboardingComplete: false,
        pathname: '/onboarding',
      })
    ).toEqual({ evaluated: true, redirectToOnboarding: false });
  });
});
