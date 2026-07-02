import { describe, expect, it, mock } from 'bun:test';
import * as React from 'react';
import en from '../../../libs/i18n/locales/en.json';
import { findAll, render } from './render-helpers';

const tEn = (key: string): string =>
  (key
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined,
      en
    ) as string) ?? key;

mock.module('../../../libs/i18n', () => ({ useT: () => tEn }));
mock.module('../../../components/themed', () => ({ readableTextOn: () => '#000' }));

const { default: GalleryThumb, resolveGalleryThumb } = await import(
  '../../../components/pilgrimage/camera/GalleryThumb'
);

type Props = React.ComponentProps<typeof GalleryThumb>;
const noop = () => undefined;

describe('gallery thumb model', () => {
  it('is empty with no captures', () => {
    expect(resolveGalleryThumb([])).toEqual({ thumbUri: null, count: 0, isEmpty: true });
  });
  it('uses the newest uri and the count when captures exist', () => {
    expect(resolveGalleryThumb(['a', 'b', 'c'])).toEqual({ thumbUri: 'a', count: 3, isEmpty: false });
  });
});

describe('gallery thumb component', () => {
  it('imports from library directly when empty', () => {
    let imported = 0;
    const props: Props = {
      uris: [],
      themeColor: '#ff9900',
      onPickLibrary: () => {
        imported += 1;
      },
      onExpand: noop,
    };
    const tree = render(GalleryThumb, props);
    const btn = findAll(tree, (n) => typeof (n.props as { onPress?: unknown }).onPress === 'function')[0];
    expect(btn).toBeTruthy();
    (btn.props as { onPress: () => void }).onPress();
    expect(imported).toBe(1);
  });

  it('expands history when captures exist', () => {
    let expanded = 0;
    const props: Props = {
      uris: ['a', 'b'],
      themeColor: '#ff9900',
      onPickLibrary: noop,
      onExpand: () => {
        expanded += 1;
      },
    };
    const tree = render(GalleryThumb, props);
    const btn = findAll(tree, (n) => typeof (n.props as { onPress?: unknown }).onPress === 'function')[0];
    expect(btn).toBeTruthy();
    (btn.props as { onPress: () => void }).onPress();
    expect(expanded).toBe(1);
  });
});
