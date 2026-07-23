// Smoke tests for the MapLibre marker views. No native render is possible, so we
// inspect the React element tree (via render-helpers) to pin that each kind shows
// the right badge/photo/star and the cluster/user-puck switch on count/heading.
import { describe, expect, it } from 'bun:test';
import type { MapMarker } from '../../../libs/services/pilgrimage/map-engine/types';
import { NativeMapMarker } from '../../../components/pilgrimage/map/engines/markers/NativeMapMarker';
import { ClusterBubble } from '../../../components/pilgrimage/map/engines/markers/ClusterBubble';
import { UserPuck } from '../../../components/pilgrimage/map/engines/markers/UserPuck';
import { findAll, getAllText, render } from './render-helpers';

const marker = (over: Partial<MapMarker>): MapMarker => ({
  id: 'x',
  lat: 35,
  lng: 135,
  kind: 'spot',
  title: 't',
  color: '#33AACC',
  ...over,
});

describe('NativeMapMarker', () => {
  it('anime balloon shows the cover photo + points badge', () => {
    const tree = render(NativeMapMarker, {
      marker: marker({
        kind: 'anime',
        color: '#FF5577',
        image: 'https://img/c.jpg',
        pointsLength: 12,
      }),
    });
    expect(findAll(tree, (n) => n.type === 'Image').length).toBe(1);
    expect(getAllText(tree)).toContain('12');
  });

  it('spot bubble shows the EP badge', () => {
    const tree = render(NativeMapMarker, {
      marker: marker({ kind: 'spot', episode: 2, markerMode: 'bubble', visited: true }),
    });
    expect(getAllText(tree)).toContain('EP 2');
  });

  it('spot dot shows neither photo nor badge', () => {
    const tree = render(NativeMapMarker, { marker: marker({ kind: 'spot', markerMode: 'dot' }) });
    expect(findAll(tree, (n) => n.type === 'Image').length).toBe(0);
    expect(getAllText(tree)).toEqual([]);
  });

  it('Tourism-88 pin shows the star + #id', () => {
    const tree = render(NativeMapMarker, {
      marker: marker({ id: '88:7', kind: 'city88', color: '#D4AF37', eightyEightId: 7 }),
    });
    const text = getAllText(tree);
    expect(text).toContain('★');
    expect(text).toContain('#7');
  });

  it('PILG-058 renders stamp, shop, and festival pins with distinct icon geometry', () => {
    const stamp = render(NativeMapMarker, {
      marker: marker({ kind: 'stamp', visited: true, title: 'Stamp stop' }),
    });
    const shop = render(NativeMapMarker, {
      marker: marker({ kind: 'shop', title: 'Shop' }),
    });
    const festival = render(NativeMapMarker, {
      marker: marker({ kind: 'festival', title: 'Festival' }),
    });

    expect(findAll(stamp, (node) => node.props.name === 'ticket-outline').length).toBe(1);
    expect(findAll(stamp, (node) => node.props.name === 'checkmark').length).toBe(1);
    expect(findAll(shop, (node) => node.props.name === 'storefront-outline').length).toBe(1);
    expect(findAll(festival, (node) => node.props.name === 'sparkles-outline').length).toBe(1);
  });

  it('PILG-058 renders Anime88 city-only data as a labelled area, not a pin', () => {
    const area = render(NativeMapMarker, {
      marker: marker({ kind: 'area', precision: 'area', title: 'Numazu area' }),
    });

    expect(getAllText(area)).toContain('Numazu area');
    expect(findAll(area, (node) => node.props.name === 'map-outline').length).toBe(1);
    expect(findAll(area, (node) => node.props.name === 'navigate-outline').length).toBe(0);
  });
});

describe('ClusterBubble', () => {
  it('shows the count when zoomed in (numbered bubble)', () => {
    const tree = render(ClusterBubble, { count: 42, color: '#abcabc', zoom: 12 });
    expect(getAllText(tree)).toContain('42');
  });

  it('hides the count when zoomed out (dot)', () => {
    const tree = render(ClusterBubble, { count: 42, color: '#abcabc', zoom: 5 });
    expect(getAllText(tree)).toEqual([]);
  });
});

describe('UserPuck', () => {
  it('renders the heading cone only in compass mode', () => {
    const withHeading = render(UserPuck, { heading: 90 });
    expect(
      findAll(withHeading, (n) => n.props.accessibilityLabel === 'heading-cone').length
    ).toBeGreaterThan(0);
    const followOnly = render(UserPuck, { heading: null });
    expect(findAll(followOnly, (n) => n.props.accessibilityLabel === 'heading-cone').length).toBe(
      0
    );
  });
});
