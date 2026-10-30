// Alternate app icons (expo-alternate-app-icons). The package throws at import
// when its native module is missing — a dev client or binary built before the
// plugin was added — and Expo Router loads every route eagerly, so a bare
// import would take the whole app down. Resolve it once, guarded.

type AltIcons = typeof import('expo-alternate-app-icons');

let mod: AltIcons | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  mod = require('expo-alternate-app-icons') as AltIcons;
} catch {
  mod = null;
}

export const supportsAlternateIcons = mod?.supportsAlternateIcons === true;

/** Alternate icon names; must match the plugin entry in app.json. */
export type AppIconName = 'NightLines' | 'OneEye' | 'MangaOrange' | 'MangaNight';

export function getAppIconName(): string | null {
  return supportsAlternateIcons && mod ? mod.getAppIconName() : null;
}

/** `null` restores the default icon. Resolves to the icon now in use. */
export async function setAppIcon(name: AppIconName | null): Promise<string | null> {
  if (!supportsAlternateIcons || !mod) throw new Error('Alternate app icons unavailable');
  return mod.setAlternateAppIcon(name);
}
