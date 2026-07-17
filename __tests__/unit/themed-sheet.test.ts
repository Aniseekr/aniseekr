import { describe, expect, it, mock } from 'bun:test';
import { render } from './pilgrimage/render-helpers';

mock.module('../../libs/i18n', () => ({ useT: () => (key: string) => key }));

const { SheetBackdrop } = await import('../../components/themed/sheet/SheetBackdrop');

describe('themed sheet primitives', () => {
  it('renders a dismiss backdrop and calls onPress', () => {
    let closed = 0;
    const tree = render(SheetBackdrop, {
      onPress: () => {
        closed += 1;
      },
    });

    expect(tree.type).toBe('Pressable');
    expect(tree.props.accessibilityLabel).toBe('commonUi.dismiss');
    expect(tree.props.accessibilityRole).toBe('button');

    const onPress = tree.props.onPress as () => void;
    onPress();
    expect(closed).toBe(1);
  });
});
