import { beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import * as Sharing from 'expo-sharing';
import { Linking, Share } from 'react-native';
import {
  shareSavedImage,
  shareToLine,
  shareToTwitter,
} from '../../../libs/services/pilgrimage/share-intents';

describe('pilgrimage share intents', () => {
  beforeEach(() => {
    mock.restore();
  });

  it('does not dispatch a share intent when saving the image fails', async () => {
    const captureImage = mock(async () => 'file:///tmp/share-card.png');
    const saveImage = mock(async () => {
      throw new Error('photo library denied');
    });
    const shareImage = mock(async () => 'shared');

    const result = await shareSavedImage({ captureImage, saveImage, shareImage });

    expect(result.status).toBe('save-failed');
    expect(captureImage).toHaveBeenCalledTimes(1);
    expect(saveImage).toHaveBeenCalledWith('file:///tmp/share-card.png');
    expect(shareImage).not.toHaveBeenCalled();
  });

  it('shares to X with the captured image instead of a text-only deep link', async () => {
    const sharingSpy = spyOn(Sharing, 'shareAsync').mockResolvedValue(undefined);
    const shareSpy = spyOn(Share, 'share');
    const openSpy = spyOn(Linking, 'openURL');

    const result = await shareToTwitter({
      imageUri: 'file:///tmp/share-card.png',
      caption: 'anime pilgrimage caption',
    });

    expect(result.delivered).toBe('sheet');
    expect(sharingSpy).toHaveBeenCalledWith('file:///tmp/share-card.png', {
      dialogTitle: 'Share image',
      mimeType: 'image/png',
      UTI: 'public.png',
    });
    expect(shareSpy).not.toHaveBeenCalled();
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('shares to LINE with the captured image instead of a text-only deep link', async () => {
    const sharingSpy = spyOn(Sharing, 'shareAsync').mockResolvedValue(undefined);
    const shareSpy = spyOn(Share, 'share');
    const openSpy = spyOn(Linking, 'openURL');

    const result = await shareToLine({
      imageUri: 'file:///tmp/share-card.png',
      caption: 'anime pilgrimage caption',
    });

    expect(result.delivered).toBe('sheet');
    expect(sharingSpy).toHaveBeenCalledWith('file:///tmp/share-card.png', {
      dialogTitle: 'Share image',
      mimeType: 'image/png',
      UTI: 'public.png',
    });
    expect(shareSpy).not.toHaveBeenCalled();
    expect(openSpy).not.toHaveBeenCalled();
  });
});
