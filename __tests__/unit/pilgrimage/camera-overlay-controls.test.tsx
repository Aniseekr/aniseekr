import { describe, expect, it, mock } from 'bun:test';
import * as React from 'react';
import en from '../../../libs/i18n/locales/en.json';
import { findAll, render } from './render-helpers';

// English catalog lookup — components resolve labels via useT(), and en is the
// default test language.
const tEn = (key: string): string =>
  (key
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined,
      en
    ) as string) ?? key;

mock.module('../../../libs/i18n', () => ({
  useT: () => tEn,
}));

mock.module('@react-native-community/slider', () => ({
  default: (props: Record<string, unknown>) => React.createElement('Slider', props),
}));

mock.module('../../../components/themed', () => ({
  readableTextOn: () => '#000',
  ThemedText: (props: { children?: React.ReactNode }) =>
    React.createElement('Text', props, props.children),
}));

const { default: OverlayControlsBar } =
  await import('../../../components/pilgrimage/camera/OverlayControlsBar');

const noop = () => undefined;
type OverlayControlsBarProps = React.ComponentProps<typeof OverlayControlsBar>;

describe('camera overlay controls', () => {
  it('surfaces character selection inside subject controls', () => {
    let pickerOpenCount = 0;
    const props: OverlayControlsBarProps = {
      visible: true,
      mode: 'subject',
      edgeIntensity: 'low',
      subjectCombine: false,
      characterSelected: false,
      opacity: 0.35,
      flipped: false,
      editMode: false,
      themeColor: '#ff9900',
      onSelectOff: noop,
      onSelectMode: noop,
      onSelectEdgeIntensity: noop,
      onToggleSubjectCombine: noop,
      onOpenCharacterPicker: () => {
        pickerOpenCount += 1;
      },
      onChangeOpacity: noop,
      onToggleFlip: noop,
      onToggleEdit: noop,
    };
    const tree = render(OverlayControlsBar, props);

    const buttons = findAll(tree, (node) => node.props.accessibilityLabel === 'Pick character');
    expect(buttons.length).toBeGreaterThan(0);

    (buttons[0].props.onPress as () => void)();

    expect(pickerOpenCount).toBe(1);
  });
});
