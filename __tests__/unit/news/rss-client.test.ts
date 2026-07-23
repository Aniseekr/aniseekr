import { describe, expect, it } from 'bun:test';

import { RssClient } from '../../../libs/clients/rss-client';
import { DataSourceError } from '../../../libs/services/data-sources/data-source-error';

const response = (status: number, body = '') =>
  new Response(body, {
    status,
    headers: status === 429 ? { 'Retry-After': '2' } : undefined,
  });

describe('RssClient', () => {
  it('NEWS-009 normalizes http errors to data source error', async () => {
    await expect(
      RssClient.fetch('https://example.com/feed.xml', {
        fetchImpl: async () => response(429),
        skipRateLimit: true,
      })
    ).rejects.toMatchObject({ code: 'RATE_LIMITED' });

    await expect(
      RssClient.fetch('https://example.com/feed.xml', {
        fetchImpl: async () => response(503),
        skipRateLimit: true,
      })
    ).rejects.toMatchObject({ code: 'SERVER_ERROR' });

    await expect(
      RssClient.fetch('https://example.com/feed.xml', {
        fetchImpl: async () => {
          throw new TypeError('offline');
        },
        skipRateLimit: true,
      })
    ).rejects.toBeInstanceOf(DataSourceError);
  });
});
