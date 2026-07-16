import { rateLimiter } from '../../rate-limiter';

const TRACE_MOE_SEARCH_URL = 'https://api.trace.moe/search?cutBorders&anilistInfo';
const TRUSTED_SIMILARITY = 0.9;

export interface TraceMoeRateLimiter {
  waitForAvailability(channel: 'traceMoe'): Promise<number>;
  registerCooldown(channel: 'traceMoe', ms: number): void;
}

export interface TraceMoeTitles {
  native: string | null;
  romaji: string | null;
  english: string | null;
}

export interface TraceMoeMatch {
  anilistId: number;
  malId: number | null;
  isAdult: boolean | null;
  titles: TraceMoeTitles;
  synonyms: string[];
  episode: number | null;
  at: number;
  similarity: number;
  previewImageUrl: string;
  previewVideoUrl: string;
}

export type TraceMoeSearchResult =
  | { status: 'matched'; match: TraceMoeMatch }
  | { status: 'no-match' }
  | { status: 'service-limited' }
  | { status: 'rate-limited'; retryAt: number }
  | { status: 'invalid-image' }
  | { status: 'cancelled' }
  | { status: 'error' };

export interface TraceMoeSearchInput {
  image: Blob;
  fileName: string;
  signal?: AbortSignal;
}

interface FetchResponseLike {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
}

interface FetchInitLike {
  method?: string;
  body?: FormData;
  signal?: AbortSignal;
}

type FetchLike = (input: string, init?: FetchInitLike) => Promise<FetchResponseLike>;

interface TraceMoeClientOptions {
  fetchImpl?: FetchLike;
  limiter?: TraceMoeRateLimiter;
  timeoutMs?: number;
  now?: () => number;
}

export class TraceMoeClient {
  private readonly fetchImpl: FetchLike | null;
  private readonly limiter: TraceMoeRateLimiter;
  private readonly timeoutMs: number;
  private readonly now: () => number;
  private requestQueue: Promise<void> = Promise.resolve();

  constructor(options: TraceMoeClientOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? null;
    this.limiter = options.limiter ?? rateLimiter;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.now = options.now ?? Date.now;
  }

  // React Native's global fetch serializes FormData through the XHR layer,
  // which only understands string and `{uri}` parts — the expo-file-system
  // `File` we upload is a Blob-interface part it cannot encode. Only
  // `expo/fetch` multipart-encodes Blob/File parts, so it is the default.
  private async resolveFetch(): Promise<FetchLike> {
    if (this.fetchImpl) return this.fetchImpl;
    const module = await import('expo/fetch');
    return module.fetch;
  }

  search(input: TraceMoeSearchInput): Promise<TraceMoeSearchResult> {
    const request = this.requestQueue.then(() => this.performSearch(input));
    this.requestQueue = request.then(
      () => undefined,
      () => undefined
    );
    return request;
  }

  private async performSearch(input: TraceMoeSearchInput): Promise<TraceMoeSearchResult> {
    if (input.signal?.aborted) return { status: 'cancelled' };
    await this.limiter.waitForAvailability('traceMoe');
    if (input.signal?.aborted) return { status: 'cancelled' };

    const form = new FormData();
    form.append('image', input.image, input.fileName);

    const controller = new AbortController();
    const abortFromCaller = () => controller.abort();
    input.signal?.addEventListener('abort', abortFromCaller, { once: true });
    const timer =
      this.timeoutMs > 0 ? setTimeout(() => controller.abort(), this.timeoutMs) : undefined;

    try {
      const fetchImpl = await this.resolveFetch();
      const response = await fetchImpl(TRACE_MOE_SEARCH_URL, {
        method: 'POST',
        body: form,
        signal: controller.signal,
      });
      if (!response.ok) return this.mapHttpFailure(response);

      const payload: unknown = await response.json();
      return decodeSearchPayload(payload);
    } catch (error) {
      if (input.signal?.aborted) return { status: 'cancelled' };
      if (error instanceof Error && error.name === 'AbortError') return { status: 'error' };
      return { status: 'error' };
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      input.signal?.removeEventListener('abort', abortFromCaller);
    }
  }

  private mapHttpFailure(response: FetchResponseLike): TraceMoeSearchResult {
    if (response.status === 400) return { status: 'invalid-image' };
    if (response.status === 402) return { status: 'service-limited' };
    if (response.status === 429) {
      const cooldownMs =
        parseRetryAfterMs(response.headers.get('Retry-After'), this.now()) ?? 60_000;
      this.limiter.registerCooldown('traceMoe', cooldownMs);
      return { status: 'rate-limited', retryAt: this.now() + cooldownMs };
    }
    return { status: 'error' };
  }
}

function decodeSearchPayload(payload: unknown): TraceMoeSearchResult {
  if (!isRecord(payload) || !Array.isArray(payload.result)) return { status: 'error' };

  const matches = payload.result
    .map(decodeMatch)
    .filter((match): match is TraceMoeMatch => match !== null)
    .sort((a, b) => b.similarity - a.similarity);
  const strongest = matches[0];
  if (!strongest || strongest.similarity < TRUSTED_SIMILARITY) {
    return { status: 'no-match' };
  }
  return { status: 'matched', match: strongest };
}

function decodeMatch(value: unknown): TraceMoeMatch | null {
  if (!isRecord(value)) return null;
  const anime = decodeAnime(value.anilist);
  const similarity = finiteNumber(value.similarity);
  const at = finiteNumber(value.at) ?? midpoint(value.from, value.to);
  if (!anime || similarity === null || at === null) return null;

  return {
    ...anime,
    episode: normalizeEpisode(value.episode),
    at,
    similarity,
    previewImageUrl: typeof value.image === 'string' ? value.image : '',
    previewVideoUrl: typeof value.video === 'string' ? value.video : '',
  };
}

function decodeAnime(
  value: unknown
): Omit<
  TraceMoeMatch,
  'episode' | 'at' | 'similarity' | 'previewImageUrl' | 'previewVideoUrl'
> | null {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return {
      anilistId: value,
      malId: null,
      isAdult: null,
      titles: { native: null, romaji: null, english: null },
      synonyms: [],
    };
  }
  if (!isRecord(value)) return null;
  const anilistId = finiteNumber(value.id);
  if (anilistId === null || !Number.isInteger(anilistId) || anilistId <= 0) return null;
  const title = isRecord(value.title) ? value.title : {};
  const malId = finiteNumber(value.idMal);
  return {
    anilistId,
    malId: malId !== null && Number.isInteger(malId) && malId > 0 ? malId : null,
    isAdult: typeof value.isAdult === 'boolean' ? value.isAdult : null,
    titles: {
      native: stringOrNull(title.native),
      romaji: stringOrNull(title.romaji),
      english: stringOrNull(title.english),
    },
    synonyms: Array.isArray(value.synonyms)
      ? value.synonyms.filter((item): item is string => typeof item === 'string')
      : [],
  };
}

function normalizeEpisode(value: unknown): number | null {
  if (Array.isArray(value)) {
    const unique = [
      ...new Set(value.map(positiveNumber).filter((item): item is number => item !== null)),
    ];
    return unique.length === 1 ? unique[0] : null;
  }
  return positiveNumber(value);
}

function positiveNumber(value: unknown): number | null {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function midpoint(from: unknown, to: unknown): number | null {
  const start = finiteNumber(from);
  const end = finiteNumber(to);
  return start === null || end === null ? null : (start + end) / 2;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseRetryAfterMs(header: string | null, now: number): number | null {
  if (!header) return null;
  const seconds = Number(header.trim());
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
  const timestamp = Date.parse(header);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - now) : null;
}

export const traceMoeClient = new TraceMoeClient();
