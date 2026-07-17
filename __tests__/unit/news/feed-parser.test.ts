import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseFeed } from '../../../libs/services/news/feed-parser';

const fixture = (name: string) =>
  readFileSync(join(import.meta.dir, '../../fixtures/news', name), 'utf8');

describe('parseFeed', () => {
  it('NEWS-001 parses rss2 items with cdata and entities', () => {
    const [article] = parseFeed(fixture('rss2.xml'), 'rss-source');

    expect(article).toMatchObject({
      id: 'rss-guid-1',
      sourceId: 'rss-source',
      title: 'Anime & Event News',
      link: 'https://example.com/rss/1',
      excerpt: 'First & strongest item with an image.',
      thumbnailUrl: 'https://example.com/media-thumb.jpg',
    });
    expect(article.publishedAt).toBe(Date.parse('Wed, 15 Jul 2026 10:30:00 GMT'));
  });

  it('NEWS-002 parses atom entries with alternate link', () => {
    const [article] = parseFeed(fixture('atom.xml'), 'atom-source');

    expect(article).toMatchObject({
      id: 'tag:example.com,2026:atom-1',
      sourceId: 'atom-source',
      title: 'Atom & Entry',
      link: 'https://example.com/atom/1',
      excerpt: "Atom summary 'decoded' text.",
    });
    expect(article.publishedAt).toBe(Date.parse('2026-07-16T09:15:00+09:00'));
  });

  it('NEWS-003 parses rdf items with dc date', () => {
    const [article] = parseFeed(fixture('rdf.xml'), 'rdf-source');

    expect(article).toMatchObject({
      id: 'https://example.com/rdf/1',
      sourceId: 'rdf-source',
      title: 'RDF News',
      link: 'https://example.com/rdf/1',
      excerpt: 'RDF & RSS 1.0 description',
    });
    expect(article.publishedAt).toBe(Date.parse('2026-07-14T12:00:00Z'));
  });

  it('NEWS-004 tolerates malformed xml and missing fields', () => {
    expect(parseFeed('<rss><channel><item>', 'broken')).toEqual([]);

    const articles = parseFeed(fixture('tolerance.xml'), 'tolerance-source');
    expect(articles).toHaveLength(1);
    expect(articles[0]).toMatchObject({
      id: 'https://example.com/no-guid',
      link: 'https://example.com/no-guid',
      publishedAt: 0,
    });
  });
});
