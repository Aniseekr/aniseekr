export function canNavigateFromRootLayout(rootNavigationReady: boolean): boolean {
  return rootNavigationReady;
}

export function shouldRedirectToOnboarding(input: {
  rootNavigationReady: boolean;
  onboardingComplete: boolean;
  pathname: string;
}): boolean {
  return resolveOnboardingGate(input).redirectToOnboarding;
}

export function resolveOnboardingGate(input: {
  rootNavigationReady: boolean;
  onboardingComplete: boolean;
  pathname: string;
}): { evaluated: boolean; redirectToOnboarding: boolean } {
  if (!canNavigateFromRootLayout(input.rootNavigationReady)) {
    return { evaluated: false, redirectToOnboarding: false };
  }
  if (input.onboardingComplete) {
    return { evaluated: true, redirectToOnboarding: false };
  }
  return {
    evaluated: true,
    redirectToOnboarding: input.pathname !== '/onboarding',
  };
}
