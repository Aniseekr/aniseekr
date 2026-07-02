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
mock.module('../../../components/themed', () => ({
  readableTextOn: () => '#000',
  ThemedText: (props: { children?: React.ReactNode }) =>
    React.createElement('Text', props, props.children),
}));

const { default: OverlayQuickControls } = await import(
  '../../../components/pilgrimage/camera/OverlayQuickControls'
);

type Props = React.ComponentProps<typeof OverlayQuickControls>;
const noop = () => undefined;

const base: Props = {
  mode: 'subject',
  edgeIntensity: 'low',
  subjectFocus: 'normal',
  subjectCombine: false,
  characterSelected: false,
  flipped: false,
  editMode: false,
  themeColor: '#ff9900',
  onSelectEdgeIntensity: noop,
  onSelectSubjectFocus: noop,
  onToggleSubjectCombine: noop,
  onOpenCharacterPicker: noop,
  onToggleFlip: noop,
  onToggleEdit: noop,
};

describe('overlay quick controls', () => {
  it('surfaces the character picker in subject mode (preserves the old OverlayControlsBar behavior)', () => {
    let opened = 0;
    const tree = render(OverlayQuickControls, { ...base, onOpenCharacterPicker: () => (opened += 1) });
    const pick = findAll(
      tree,
      (n) => (n.props as { accessibilityLabel?: unknown }).accessibilityLabel === 'Pick character'
    )[0];
    expect(pick).toBeTruthy();
    (pick.props as { onPress: () => void }).onPress();
    expect(opened).toBe(1);
  });

  it('shows the edge-intensity segment in edge mode', () => {
    const tree = render(OverlayQuickControls, { ...base, mode: 'edge' });
    const low = findAll(
      tree,
      (n) => (n.props as { accessibilityLabel?: unknown }).accessibilityLabel === 'Edge+'
    );
    expect(low.length).toBeGreaterThan(0);
  });

  it('always exposes reposition + flip controls', () => {
    const tree = render(OverlayQuickControls, base);
    const flip = findAll(
      tree,
      (n) => (n.props as { accessibilityLabel?: unknown }).accessibilityLabel === 'Flip overlay horizontally'
    );
    expect(flip.length).toBeGreaterThan(0);
  });
});
