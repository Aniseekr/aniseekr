import { afterEach, expect, it, mock } from 'bun:test';
import { AnnictProvider } from '../../../libs/services/providers/annict-provider';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

it('maps the work objects returned by the Annict account list', async () => {
  globalThis.fetch = mock(
    async () =>
      new Response(
        JSON.stringify({
          works: [
            { id: 4681, title: 'Flying Witch', episodes_count: 12, status: { kind: 'watched' } },
          ],
          total_count: 1,
        })
      )
  ) as unknown as typeof fetch;
  expect(await new AnnictProvider().fetchUserList('token')).toMatchObject([
    { id: 'annict_4681', title: 'Flying Witch', status: 'completed', progress: 12 },
  ]);
});

it('rejects unsupported work scores instead of posting an invalid episode record', async () => {
  const fetchMock = mock(async () => new Response('{}'));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  await expect(new AnnictProvider().updateScore('4681', 8, 'token')).rejects.toThrow();
  expect(fetchMock).not.toHaveBeenCalled();
});
