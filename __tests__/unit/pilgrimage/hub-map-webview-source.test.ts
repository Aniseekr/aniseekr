import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sourcePath = join(process.cwd(), 'components/pilgrimage/HubMapWebView.tsx');

describe('HubMapWebView Android source stability', () => {
  test('does not pass a fresh inline source object to WebView', () => {
    const source = readFileSync(sourcePath, 'utf8');

    expect(source).not.toContain('source={{ html, baseUrl: MAP_BASE_URL }}');
    expect(source).toContain('const webViewSource = useMemo(');
    expect(source).toContain('source={webViewSource}');
  });
});
