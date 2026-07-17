import type { NewsArticle } from './types';

const MAX_EXCERPT = 200;

export function parseFeed(xml: string, sourceId: string): NewsArticle[] {
  try {
    if (!looksClosed(xml)) return [];
    const normalized = stripCdata(xml);
    if (/<feed[\s>]/i.test(normalized)) return parseAtom(normalized, sourceId);
    if (/<rdf:RDF[\s>]/i.test(normalized) || /<RDF[\s>]/i.test(normalized)) {
      return parseRdf(normalized, sourceId);
    }
    if (/<rss[\s>]/i.test(normalized)) return parseRss(normalized, sourceId);
    return [];
  } catch {
    return [];
  }
}

function parseRss(xml: string, sourceId: string): NewsArticle[] {
  return blocks(xml, 'item').flatMap((item) => toArticle({
    sourceId,
    id: text(item, 'guid') ?? text(item, 'id'),
    title: text(item, 'title'),
    link: text(item, 'link'),
    date: text(item, 'pubDate'),
    body: text(item, 'description'),
    thumbnailUrl: mediaUrl(item) ?? enclosureImage(item) ?? imgFromHtml(text(item, 'description') ?? ''),
  }));
}

function parseAtom(xml: string, sourceId: string): NewsArticle[] {
  return blocks(xml, 'entry').flatMap((entry) => toArticle({
    sourceId,
    id: text(entry, 'id'),
    title: text(entry, 'title'),
    link: atomLink(entry),
    date: text(entry, 'updated') ?? text(entry, 'published'),
    body: text(entry, 'summary') ?? text(entry, 'content'),
    thumbnailUrl: mediaUrl(entry) ?? enclosureImage(entry),
  }));
}

function parseRdf(xml: string, sourceId: string): NewsArticle[] {
  return blocks(xml, 'item').flatMap((item) => toArticle({
    sourceId,
    id: attrFromOpenTag(item, 'rdf:about') ?? attrFromOpenTag(item, 'about'),
    title: text(item, 'title'),
    link: text(item, 'link'),
    date: text(item, 'dc:date'),
    body: text(item, 'description'),
    thumbnailUrl: mediaUrl(item) ?? imgFromHtml(text(item, 'description') ?? ''),
  }));
}

function toArticle(input: {
  sourceId: string;
  id?: string;
  title?: string;
  link?: string;
  date?: string;
  body?: string;
  thumbnailUrl?: string;
}): NewsArticle[] {
  const link = cleanText(input.link);
  const id = cleanText(input.id) || link;
  if (!id || !link) return [];
  const title = cleanText(input.title);
  if (!title) return [];
  const article: NewsArticle = {
    id,
    sourceId: input.sourceId,
    title,
    link,
    publishedAt: parseDate(input.date),
  };
  const excerpt = truncateExcerpt(cleanText(input.body));
  if (excerpt) article.excerpt = excerpt;
  const thumbnailUrl = cleanText(input.thumbnailUrl);
  if (thumbnailUrl) article.thumbnailUrl = thumbnailUrl;
  return [article];
}

function looksClosed(xml: string): boolean {
  const src = xml.trim();
  if (!src.includes('<') || !src.includes('>')) return false;
  const opens = (src.match(/<item\b|<entry\b/gi) ?? []).length;
  const closes = (src.match(/<\/item>|<\/entry>/gi) ?? []).length;
  return opens === closes;
}

function stripCdata(xml: string): string {
  return xml.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
}

function blocks(xml: string, tag: string): string[] {
  const escaped = tag.replace(':', '\\:');
  const re = new RegExp(`<${escaped}\\b[\\s\\S]*?<\\/${escaped}>`, 'gi');
  return xml.match(re) ?? [];
}

function text(xml: string, tag: string): string | undefined {
  const escaped = tag.replace(':', '\\:');
  const re = new RegExp(`<${escaped}\\b[^>]*>([\\s\\S]*?)<\\/${escaped}>`, 'i');
  const match = re.exec(xml);
  return match ? decodeText(match[1]) : undefined;
}

function attrFromOpenTag(xml: string, attr: string): string | undefined {
  const open = /^<[^>]+>/i.exec(xml)?.[0];
  return open ? attrValue(open, attr) : undefined;
}

function mediaUrl(xml: string): string | undefined {
  const media = /<media:(?:thumbnail|content)\b[^>]*>/i.exec(xml)?.[0];
  return media ? attrValue(media, 'url') : undefined;
}

function enclosureImage(xml: string): string | undefined {
  const matches = xml.match(/<enclosure\b[^>]*>/gi) ?? [];
  for (const tag of matches) {
    const type = attrValue(tag, 'type') ?? '';
    if (type.toLowerCase().startsWith('image/')) return attrValue(tag, 'url');
  }
  return undefined;
}

function atomLink(xml: string): string | undefined {
  const matches = xml.match(/<link\b[^>]*\/?>/gi) ?? [];
  const alternate = matches.find((tag) => (attrValue(tag, 'rel') ?? 'alternate') === 'alternate');
  return attrValue(alternate ?? matches[0] ?? '', 'href') ?? text(xml, 'link');
}

function attrValue(tag: string, attr: string): string | undefined {
  const re = new RegExp(`${attr}=["']([^"']+)["']`, 'i');
  const match = re.exec(tag);
  return match ? decodeText(match[1]) : undefined;
}

function imgFromHtml(html: string): string | undefined {
  const img = /<img\b[^>]*>/i.exec(html)?.[0];
  return img ? attrValue(img, 'src') : undefined;
}

function cleanText(value?: string): string {
  if (!value) return '';
  return decodeText(value)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateExcerpt(value: string): string {
  if (value.length <= MAX_EXCERPT) return value;
  const slice = value.slice(0, MAX_EXCERPT + 1);
  const boundary = slice.lastIndexOf(' ');
  return `${slice.slice(0, boundary > 120 ? boundary : MAX_EXCERPT).trim()}…`;
}

function parseDate(value?: string): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function decodeText(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
