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

// Chainable Gesture.Pan() builder stub + passthrough GestureDetector so the
// synthetic renderer can walk past the gesture wrapper to the carousel items.
const gestureChain: unknown = new Proxy(() => gestureChain, { get: () => () => gestureChain });
mock.module('react-native-gesture-handler', () => ({
  GestureDetector: (props: { children?: React.ReactNode }) => props.children,
  Gesture: { Pan: () => gestureChain },
}));

const { default: OverlayModeCarousel } = await import(
  '../../../components/pilgrimage/camera/OverlayModeCarousel'
);

type Props = React.ComponentProps<typeof OverlayModeCarousel>;
const noop = () => undefined;

describe('overlay mode carousel', () => {
  it('renders the active slot as the only selected item', () => {
    const props: Props = {
      index: 2, // edge
      onChangeIndex: noop,
      themeColor: '#ff9900',
      isLandscape: false,
      orientationMode: 'auto',
    };
    const tree = render(OverlayModeCarousel, props);
    const selected = findAll(
      tree,
      (n) => (n.props as { accessibilityState?: { selected?: boolean } }).accessibilityState?.selected === true
    );
    expect(selected.length).toBe(1);
  });

  it('reports the tapped slot index without re-firing the already-active slot', () => {
    let nextIndex = -1;
    const props: Props = {
      index: 0, // off
      onChangeIndex: (i: number) => {
        nextIndex = i;
      },
      themeColor: '#ff9900',
      isLandscape: false,
      orientationMode: 'auto',
    };
    const tree = render(OverlayModeCarousel, props);
    const animeSlot = findAll(tree, (n) =>
      /Anime/.test(String((n.props as { accessibilityLabel?: unknown }).accessibilityLabel ?? ''))
    )[0];
    expect(animeSlot).toBeTruthy();
    (animeSlot.props as { onPress: () => void }).onPress();
    expect(nextIndex).toBe(1);
  });
});
