import * as Crypto from 'expo-crypto';
import { File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { disposeSceneImageFiles, getSceneImageResize } from './scene-image-policy';
import type { TraceMoeSearchInput } from './trace-moe-client';

export type PickSceneImageResult =
  { status: 'cancelled' } | { status: 'denied' } | { status: 'ok'; uri: string };

export interface PreparedSceneImage {
  searchInput: TraceMoeSearchInput;
  uploadUri: string;
  dispose(): void;
}

export async function pickSceneImage(): Promise<PickSceneImageResult> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return { status: 'denied' };

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
  };
}

export async function prepareSceneImage(uri: string): Promise<PreparedSceneImage> {
  const temporaryFiles: File[] = [];
  try {
    const localUri = materializeUri(uri);
    const source = await ImageManipulator.manipulate(localUri).renderAsync();
    const resize = getSceneImageResize(source.width);
    const rendered = resize
      ? await ImageManipulator.manipulate(source).resize(resize).renderAsync()
      : source;
    const saved = await rendered.saveAsync({
      compress: 0.88,
      format: SaveFormat.JPEG,
    });
    const uploadFile = new File(saved.uri);
    temporaryFiles.push(uploadFile);

    return {
      searchInput: {
        // Expo File implements Blob at runtime. Its declaration uses React
        // Native's FormData type, which differs from Bun's DOM type.
        image: uploadFile as unknown as Blob,
        fileName: 'scene.jpg',
      },
      uploadUri: uploadFile.uri,
      dispose: () => disposeSceneImageFiles(temporaryFiles),
    };
  } catch (error) {
    disposeSceneImageFiles(temporaryFiles);
    throw error;
  }
}

function materializeUri(uri: string): string {
  if (/^https?:\/\//i.test(uri)) throw new Error('Choose a local screenshot from your library.');
  return uri;
}
