// Home-screen widget: the next episodes of the shows the user is watching.
// Runs in the widget extension's own runtime ('widget' directive): no hooks,
// no imports of app code, nothing from module scope. Every string and state
// arrives through props, worked out by libs/services/widgets/airing-widget.ts.
import { HStack, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  containerBackground,
  font,
  foregroundStyle,
  lineLimit,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';
import { PlatformColor } from 'react-native';

export type AiringWidgetProps = {
  /** 'ready' lists `items`; every other state shows `message`. */
  state: 'ready' | 'empty' | 'stale' | 'locked';
  heading: string;
  message: string;
  items: { title: string; detail: string }[];
  /** Opened when the widget is tapped. */
  url: string;
};

const AiringWidget = (props: AiringWidgetProps, environment: WidgetEnvironment) => {
  'widget';
  const shown = props.items.slice(0, environment.widgetFamily === 'systemSmall' ? 1 : 3);
  return (
    <VStack
      alignment="leading"
      spacing={6}
      modifiers={[
        containerBackground(PlatformColor('systemBackground'), 'widget'),
        widgetURL(props.url),
      ]}>
      <Text
        modifiers={[
          font({ textStyle: 'caption', weight: 'bold' }),
          foregroundStyle(PlatformColor('secondaryLabel')),
        ]}>
        {props.heading}
      </Text>
      {props.state === 'ready' ? (
        shown.map((item) => (
          <VStack key={item.title} alignment="leading" spacing={1}>
            <Text
              modifiers={[font({ textStyle: 'subheadline', weight: 'semibold' }), lineLimit(1)]}>
              {item.title}
            </Text>
            <Text
              modifiers={[
                font({ textStyle: 'caption' }),
                foregroundStyle(PlatformColor('secondaryLabel')),
                lineLimit(1),
              ]}>
              {item.detail}
            </Text>
          </VStack>
        ))
      ) : (
        <Text
          modifiers={[
            font({ textStyle: 'subheadline' }),
            foregroundStyle(PlatformColor('secondaryLabel')),
          ]}>
          {props.message}
        </Text>
      )}
      <HStack>
        <Spacer />
      </HStack>
      <Spacer />
    </VStack>
  );
};

export default createWidget('AiringWidget', AiringWidget, {
  state: 'stale',
  heading: 'Aniseekr',
  message: '',
  items: [],
  url: 'aniseeker:///bangumi',
});
