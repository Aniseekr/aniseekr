import { describe, it, expect } from 'bun:test';
import {
  routeForNotificationResponse,
  type NotificationLike,
} from '../../libs/services/streaming/streaming-notification-route';

function fake(data: Record<string, unknown>): NotificationLike {
  return {
    notification: {
      request: {
        content: { data },
      },
    },
  };
}

describe('routeForNotificationResponse', () => {
  it('SN-001 episode_reminder routes to /anime/[id]?openWatch=1', () => {
    expect(
      routeForNotificationResponse(fake({ kind: 'episode_reminder', animeId: '178025' }))
    ).toBe('/anime/178025?openWatch=1');
  });

  it('SN-002 daily_digest routes to home tab', () => {
    expect(routeForNotificationResponse(fake({ kind: 'daily_digest' }))).toBe('/');
  });

  it('SN-003 achievement_unlock routes to achievements screen', () => {
    expect(
      routeForNotificationResponse(fake({ kind: 'achievement_unlock', achievementId: 'first' }))
    ).toBe('/(setting)/achievements');
  });

  it('SN-004 missing data returns null instead of fake route', () => {
    expect(routeForNotificationResponse(null)).toBeNull();
    expect(routeForNotificationResponse(undefined)).toBeNull();
    expect(routeForNotificationResponse(fake({}))).toBeNull();
    expect(routeForNotificationResponse(fake({ kind: 'unknown' }))).toBeNull();
  });

  it('SN-005 episode_reminder without animeId returns null (cannot navigate)', () => {
    expect(routeForNotificationResponse(fake({ kind: 'episode_reminder' }))).toBeNull();
    // Empty string is rejected too — no fake row.
    expect(
      routeForNotificationResponse(fake({ kind: 'episode_reminder', animeId: '' }))
    ).toBeNull();
  });

  it('PILG-048 pilgrimage_event routes to the first-class event detail when eventId exists', () => {
    expect(
      routeForNotificationResponse(
        fake({ kind: 'pilgrimage_event', animeId: '22759', eventId: 'yuwaku-bonbori-matsuri' })
      )
    ).toBe('/pilgrimage/event/yuwaku-bonbori-matsuri');
    // Event id is optional — the anime's pilgrimage page is still the target.
    expect(routeForNotificationResponse(fake({ kind: 'pilgrimage_event', animeId: '22759' }))).toBe(
      '/pilgrimage/22759'
    );
  });

  it('PILG-048 pilgrimage_event without animeId returns null', () => {
    expect(routeForNotificationResponse(fake({ kind: 'pilgrimage_event' }))).toBeNull();
    expect(
      routeForNotificationResponse(fake({ kind: 'pilgrimage_event', animeId: '' }))
    ).toBeNull();
  });
});
