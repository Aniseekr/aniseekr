// Shared "pick a character image" step for the companion feature. The lift
// (去背) itself now happens inside the cutout editor screen, which the caller
// opens with the picked uri — so this module is only the permission + picker
// hop. See app/companion/edit-cutout.tsx and cutout-editor-session.ts.

import * as ImagePicker from 'expo-image-picker';

export type PickedCharacterImage =
  | { status: 'cancelled' }
  | { status: 'denied' }
  | { status: 'ok'; uri: string; fileName: string | null; width: number; height: number };

export async function pickCharacterImage(): Promise<PickedCharacterImage> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return { status: 'denied' };

  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: false,
    quality: 1,
  });
  if (picked.canceled || picked.assets.length === 0) return { status: 'cancelled' };
  const asset = picked.assets[0];
  return {
    status: 'ok',
    uri: asset.uri,
    fileName: asset.fileName ?? null,
    width: asset.width ?? 0,
    height: asset.height ?? 0,
  };
}

/** "IMG_1234.HEIC" → "IMG_1234"; null when there's nothing usable. */
export function displayNameFromFileName(fileName: string | null): string | null {
  if (!fileName) return null;
  const stem = fileName.replace(/\.[^.]+$/, '').trim();
  return stem.length > 0 ? stem : null;
}
