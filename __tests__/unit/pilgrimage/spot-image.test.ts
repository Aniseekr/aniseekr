import { describe, expect, test } from 'bun:test';
import { sanitizeImageUri } from '../../../components/pilgrimage/SpotImage';

describe('sanitizeImageUri', () => {
  test('accepts absolute http(s) urls', () => {
    expect(sanitizeImageUri('https://image.anitabi.cn/points/1/a.jpg?plan=h160')).toBe(
      'https://image.anitabi.cn/points/1/a.jpg?plan=h160'
    );
  });
  test('accepts absolute file urls (local captures)', () => {
    expect(sanitizeImageUri('file:///tmp/x.jpg')).toBe('file:///tmp/x.jpg');
  });
  test('rejects empty, relative, and non-string input', () => {
    expect(sanitizeImageUri('')).toBeNull();
    expect(sanitizeImageUri('   ')).toBeNull();
    expect(sanitizeImageUri('/images/points/1/a.jpg')).toBeNull();
    expect(sanitizeImageUri(null)).toBeNull();
    expect(sanitizeImageUri(undefined)).toBeNull();
  });
});
