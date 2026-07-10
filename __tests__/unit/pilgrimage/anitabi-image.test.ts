import { describe, expect, it, test } from 'bun:test';
import {
  anitabiImageSource,
  anitabiProxyUri,
  ANITABI_PROXY_BASE,
  normalizeAnitabiImageUrl,
  toFullResImageUrl,
} from '../../../libs/services/pilgrimage/anitabi-image';

describe('toFullResImageUrl', () => {
  it('strips a sole `?plan=h160` query', () => {
    expect(
      toFullResImageUrl('https://image.anitabi.cn/points/207195/abc.jpg?plan=h160')
    ).toBe('https://image.anitabi.cn/points/207195/abc.jpg');
  });

  it('strips `?plan=` regardless of value', () => {
    expect(
      toFullResImageUrl('https://image.anitabi.cn/points/x.jpg?plan=h720')
    ).toBe('https://image.anitabi.cn/points/x.jpg');
  });

  it('preserves other query params when stripping the leading `?plan=`', () => {
    expect(
      toFullResImageUrl('https://image.anitabi.cn/p.jpg?plan=h160&v=2')
    ).toBe('https://image.anitabi.cn/p.jpg?v=2');
  });

  it('strips `&plan=` from the middle of the query', () => {
    expect(
      toFullResImageUrl('https://image.anitabi.cn/p.jpg?v=2&plan=h160&w=1')
    ).toBe('https://image.anitabi.cn/p.jpg?v=2&w=1');
  });

  it('returns the input unchanged when no plan token is present', () => {
    expect(toFullResImageUrl('https://image.anitabi.cn/p.jpg')).toBe(
      'https://image.anitabi.cn/p.jpg'
    );
    expect(toFullResImageUrl('https://image.anitabi.cn/p.jpg?v=2')).toBe(
      'https://image.anitabi.cn/p.jpg?v=2'
    );
  });

  it('handles empty input', () => {
    expect(toFullResImageUrl('')).toBe('');
  });
});

describe('normalizeAnitabiImageUrl', () => {
  it('normalizes runtime /images/bangumi cover paths to the Anitabi image CDN', () => {
    expect(normalizeAnitabiImageUrl('/images/bangumi/10380.jpg', 10380)).toBe(
      'https://image.anitabi.cn/bangumi/10380.jpg?plan=h160'
    );
  });

  it('normalizes root-relative image paths and appends the thumbnail plan', () => {
    expect(normalizeAnitabiImageUrl('/user/0/bangumi/10380/points/a.jpg', 10380)).toBe(
      'https://image.anitabi.cn/user/0/bangumi/10380/points/a.jpg?plan=h160'
    );
  });

  it('uses the bangumi cover fallback when runtime data has an empty cover', () => {
    expect(normalizeAnitabiImageUrl('', 265)).toBe(
      'https://image.anitabi.cn/bangumi/265.jpg?plan=h160'
    );
  });

  it('preserves existing Anitabi plan parameters', () => {
    expect(
      normalizeAnitabiImageUrl('https://image.anitabi.cn/bangumi/240038.jpg?plan=h360', 240038)
    ).toBe('https://image.anitabi.cn/bangumi/240038.jpg?plan=h360');
  });
});

describe('anitabiImageSource', () => {
  test('anitabi CDN urls get referer + browser UA headers', () => {
    const s = anitabiImageSource('https://image.anitabi.cn/points/1/a.jpg?plan=h160');
    expect(s.uri).toBe('https://image.anitabi.cn/points/1/a.jpg?plan=h160');
    expect(s.headers?.Referer).toBe('https://anitabi.cn/');
    expect(s.headers?.['User-Agent']).toContain('Safari');
  });
  test('non-anitabi urls stay bare', () => {
    expect(anitabiImageSource('https://lain.bgm.tv/x.jpg').headers).toBeUndefined();
  });
  test('unparseable input stays bare', () => {
    expect(anitabiImageSource('not-a-url').headers).toBeUndefined();
  });
});

describe('anitabiProxyUri', () => {
  it('rewrites an anitabi CDN point url to the proxy path when a base is set', () => {
    expect(
      anitabiProxyUri(
        'https://image.anitabi.cn/points/115908/pt1.jpg?plan=h160',
        'https://proxy.example.workers.dev'
      )
    ).toBe('https://proxy.example.workers.dev/anitabi/img/points/115908/pt1.jpg?plan=h160');
  });

  it('rewrites an anitabi bangumi cover url', () => {
    expect(
      anitabiProxyUri(
        'https://image.anitabi.cn/bangumi/240038.jpg?plan=h160',
        'https://proxy.example.workers.dev'
      )
    ).toBe('https://proxy.example.workers.dev/anitabi/img/bangumi/240038.jpg?plan=h160');
  });

  it('returns null when the base is empty (direct mode)', () => {
    expect(anitabiProxyUri('https://image.anitabi.cn/points/1/a.jpg?plan=h160', '')).toBeNull();
  });

  it('returns null for non-anitabi hosts', () => {
    expect(
      anitabiProxyUri('https://lain.bgm.tv/x.jpg', 'https://proxy.example.workers.dev')
    ).toBeNull();
  });

  it('returns null for unparseable input', () => {
    expect(anitabiProxyUri('not-a-url', 'https://proxy.example.workers.dev')).toBeNull();
  });
});

describe('anitabiImageSource proxy wiring', () => {
  // Robust to both states: this test stays green whether ANITABI_PROXY_BASE is
  // still '' (direct) or Task 4 Branch A has filled in a real origin.
  it('honors the configured proxy base', () => {
    const url = 'https://image.anitabi.cn/points/1/a.jpg?plan=h160';
    const s = anitabiImageSource(url);
    if (ANITABI_PROXY_BASE) {
      expect(s.uri).toBe(anitabiProxyUri(url) ?? '');
      expect(s.headers).toBeUndefined();
    } else {
      expect(s.uri).toBe(url);
      expect(s.headers?.Referer).toBe('https://anitabi.cn/');
    }
  });
});


describe('anitabiProxyUri trailing-slash tolerance', () => {
  test('a base pasted with a trailing slash never produces a double slash', () => {
    expect(
      anitabiProxyUri('https://image.anitabi.cn/points/1/a.jpg?plan=h160', 'https://p.example.dev/')
    ).toBe('https://p.example.dev/anitabi/img/points/1/a.jpg?plan=h160');
  });
});
