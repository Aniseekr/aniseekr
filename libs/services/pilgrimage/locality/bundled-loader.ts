import type { NewsSourceFile } from '@/libs/services/news/types';
import type { LocalIntelFile } from '@/libs/services/pilgrimage/local-intel/types';
import type { LocalityDataLoader } from '@/libs/services/pilgrimage/locality/repository';
import type { LocalityDataEnvelope } from '@/libs/services/pilgrimage/locality/types';
import {
  migrateLegacyLocalitySources,
  type AnimeTourism88SourceFile,
  type LegacyLocalitySources,
} from '@/libs/services/pilgrimage/locality/migration';
import { validateLocalityDataEnvelope } from '@/libs/services/pilgrimage/locality/validator';

function unwrap<T>(module: unknown): T {
  return ((module as { default?: T })?.default ?? module) as T;
}

/**
 * The source files shipped inside the app. local-intel and Anime Tourism 88 are
 * snapshots of aniseekr-atlas/atlas/locality (refresh with `bun run locality:sync`);
 * the remote loader replaces them at runtime with the published copy.
 */
export function loadBundledLocalitySources(): LegacyLocalitySources {
  return {
    localIntel: unwrap<LocalIntelFile>(require('../local-intel/local-intel.data.json')),
    animeTourism88: unwrap<AnimeTourism88SourceFile>(require('../anime-tourism-88.data.json')),
    newsSources: unwrap<NewsSourceFile>(require('../../news/news-sources.data.json')),
  };
}

export class BundledLocalityDataLoader implements LocalityDataLoader {
  readonly id = 'bundled-locality-v1';
  private snapshot: LocalityDataEnvelope | null = null;

  loadInitial(): LocalityDataEnvelope {
    this.snapshot ??= validateLocalityDataEnvelope(
      migrateLegacyLocalitySources(loadBundledLocalitySources())
    );
    return this.snapshot;
  }

  async loadLatest(): Promise<LocalityDataEnvelope> {
    return this.loadInitial();
  }
}

export const bundledLocalityDataLoader = new BundledLocalityDataLoader();
