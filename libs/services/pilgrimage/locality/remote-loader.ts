import type { LocalIntelFile } from '@/libs/services/pilgrimage/local-intel/types';
import {
  bundledLocalityDataLoader,
  loadBundledLocalitySources,
  type BundledLocalityDataLoader,
} from '@/libs/services/pilgrimage/locality/bundled-loader';
import {
  migrateLegacyLocalitySources,
  type AnimeTourism88SourceFile,
} from '@/libs/services/pilgrimage/locality/migration';
import type { LocalityDataLoader } from '@/libs/services/pilgrimage/locality/repository';
import type { LocalityDataEnvelope } from '@/libs/services/pilgrimage/locality/types';
import { validateLocalityDataEnvelope } from '@/libs/services/pilgrimage/locality/validator';
import { kvGet, kvSet } from '@/libs/services/storage/app-storage';

/**
 * Events, stamp rallies and Anime Tourism 88, published from aniseekr-atlas to R2
 * (publish-locality workflow) and served by aniseekr-atlas-api.
 */
export const LOCALITY_URL = 'https://atlas.aniseekr.moe/api/v1/locality';
/** Payload shapes this build can read; a newer shape is ignored until the app updates. */
const SUPPORTED_FORMAT = 1;
const KEY_PAYLOAD = 'locality.remote.payload.v1';
const KEY_CHECKED_AT = 'locality.remote.checkedAt';
/** Short-lived events change weekly at most; four checks a day is plenty. */
const FRESHNESS_MS = 6 * 60 * 60 * 1000;
const TIMEOUT_MS = 15_000;

interface RemoteLocalityPayload {
  format: number;
  localIntel: LocalIntelFile;
  animeTourism88: AnimeTourism88SourceFile;
}

type Fetch = (url: string, init?: { signal?: AbortSignal }) => Promise<Response>;

/**
 * Bundle-backed remote loader. `loadInitial` stays synchronous and offline: it uses
 * the last downloaded payload when that is newer than the bundle, else the bundle.
 * `loadLatest` downloads at most every six hours; anything that fails to download,
 * parse, migrate or validate keeps the current snapshot — remote data can add
 * events, never break the screen.
 */
export class RemoteLocalityDataLoader implements LocalityDataLoader {
  readonly id = 'remote-locality-v1';
  private snapshot: LocalityDataEnvelope | null = null;
  /** The raw 88 rows behind `snapshot` — anime88-repository joins them by edition. */
  private animeTourism88: AnimeTourism88SourceFile | null = null;
  /**
   * Data revision behind `snapshot`: local-intel's generatedAt, which the atlas
   * build stamps with the commit time of the last atlas/locality change. Compared
   * on its own — the envelope's generatedAt also folds in the bundled news sources.
   */
  private revision = 0;
  private inFlight: Promise<LocalityDataEnvelope> | null = null;

  constructor(
    private readonly bundled: BundledLocalityDataLoader = bundledLocalityDataLoader,
    private readonly fetchImpl: Fetch = (url, init) => fetch(url, init),
    private readonly now: () => number = Date.now
  ) {}

  loadInitial(): LocalityDataEnvelope {
    if (this.snapshot) return this.snapshot;
    const bundledSources = loadBundledLocalitySources();
    const cached = parsePayload(kvGet(KEY_PAYLOAD));
    if (cached && cached.revision > revisionOf(bundledSources.localIntel)) {
      this.snapshot = cached.envelope;
      this.animeTourism88 = cached.animeTourism88;
      this.revision = cached.revision;
    } else {
      this.snapshot = this.bundled.loadInitial();
      this.animeTourism88 = bundledSources.animeTourism88;
      this.revision = revisionOf(bundledSources.localIntel);
    }
    return this.snapshot;
  }

  /** Anime Tourism 88 source rows matching the current snapshot. */
  currentAnimeTourism88(): AnimeTourism88SourceFile {
    this.loadInitial();
    return this.animeTourism88!;
  }

  loadLatest(): Promise<LocalityDataEnvelope> {
    this.inFlight ??= this.revalidate().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async revalidate(): Promise<LocalityDataEnvelope> {
    const current = this.loadInitial();
    const checkedAt = Number(kvGet(KEY_CHECKED_AT) ?? 0);
    if (this.now() - checkedAt < FRESHNESS_MS) return current;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let raw: string;
    try {
      const response = await this.fetchImpl(LOCALITY_URL, { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      raw = await response.text();
    } catch (error) {
      console.warn('[locality] remote fetch failed; keeping current data', error);
      return current;
    } finally {
      clearTimeout(timer);
    }

    kvSet(KEY_CHECKED_AT, String(this.now()));
    const next = parsePayload(raw);
    if (!next) {
      console.warn('[locality] remote payload rejected; keeping current data');
      return current;
    }
    if (next.revision <= this.revision) return current;
    kvSet(KEY_PAYLOAD, raw);
    this.snapshot = next.envelope;
    this.animeTourism88 = next.animeTourism88;
    this.revision = next.revision;
    return next.envelope;
  }
}

/** Remote payload → validated envelope, or null for anything this build cannot trust. */
function parsePayload(
  raw: string | null
): {
  envelope: LocalityDataEnvelope;
  animeTourism88: AnimeTourism88SourceFile;
  revision: number;
} | null {
  if (!raw) return null;
  try {
    const payload = JSON.parse(raw) as Partial<RemoteLocalityPayload>;
    if (payload.format !== SUPPORTED_FORMAT || !payload.localIntel || !payload.animeTourism88) {
      return null;
    }
    const envelope = validateLocalityDataEnvelope(
      migrateLegacyLocalitySources({
        ...loadBundledLocalitySources(),
        localIntel: payload.localIntel,
        animeTourism88: payload.animeTourism88,
      })
    );
    return {
      envelope,
      animeTourism88: payload.animeTourism88,
      revision: revisionOf(payload.localIntel),
    };
  } catch (error) {
    console.warn('[locality] invalid remote payload', error);
    return null;
  }
}

function revisionOf(file: LocalIntelFile): number {
  const value =
    typeof file.generatedAt === 'number' ? file.generatedAt : Date.parse(String(file.generatedAt));
  return Number.isFinite(value) ? value : 0;
}

export const remoteLocalityDataLoader = new RemoteLocalityDataLoader();
