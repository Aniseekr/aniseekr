import type { NewsSourceFile } from '@/libs/services/news/types';
import type { LocalIntelFile } from '@/libs/services/pilgrimage/local-intel/types';
import type { LocalityDataLoader } from '@/libs/services/pilgrimage/locality/repository';
import type { LocalityDataEnvelope } from '@/libs/services/pilgrimage/locality/types';
import {
  migrateLegacyLocalitySources,
  type AnimeTourism88SourceFile,
} from '@/libs/services/pilgrimage/locality/migration';
import { validateLocalityDataEnvelope } from '@/libs/services/pilgrimage/locality/validator';

export class BundledLocalityDataLoader implements LocalityDataLoader {
  readonly id = 'bundled-locality-v1';
  private snapshot: LocalityDataEnvelope | null = null;

  loadInitial(): LocalityDataEnvelope {
    if (this.snapshot) return this.snapshot;
    const localIntelModule = require('../local-intel/local-intel.data.json');
    const animeTourismModule = require('../anime-tourism-88.data.json');
    const newsSourcesModule = require('../../news/news-sources.data.json');
    this.snapshot = validateLocalityDataEnvelope(
      migrateLegacyLocalitySources({
        localIntel: (localIntelModule?.default ?? localIntelModule) as LocalIntelFile,
        animeTourism88: (animeTourismModule?.default ??
          animeTourismModule) as AnimeTourism88SourceFile,
        newsSources: (newsSourcesModule?.default ?? newsSourcesModule) as NewsSourceFile,
      })
    );
    return this.snapshot;
  }

  async loadLatest(): Promise<LocalityDataEnvelope> {
    return this.loadInitial();
  }
}

export const bundledLocalityDataLoader = new BundledLocalityDataLoader();
