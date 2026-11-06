import {
  AnimeSourceProvider,
  ImportedUserProfile,
  normalizeStatus,
  normalizeScore,
} from './base-provider';
import { PlatformType, AnimeStatus, UniversalAnimeItem } from '../auth/types';
import { authService } from '../auth/auth-service';

interface KavitaSeries {
  id: number;
  name: string;
  originalName: string;
  format: number;
  thumbUrl?: string;
  pagesRead: number;
  pages: number;
}

interface KavitaPluginAuth {
  username: string;
}

const PAGE_SIZE = 100;

export class KavitaProvider implements AnimeSourceProvider {
  platform: PlatformType = 'kavita';

  private async request<T>(
    endpoint: string,
    token: string,
    baseUrl: string,
    options: RequestInit = {}
  ): Promise<T> {
    const cleanBaseUrl = baseUrl.replace(/\/$/, '');

    const response = await fetch(`${cleanBaseUrl}${endpoint}`, {
      ...options,
      headers: {
        'x-api-key': token,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`Kavita API Error: ${response.status}`);
    }

    return response.json();
  }

  async authenticate(): Promise<string> {
    const credentials = await authService.connectPlatform('kavita');
    if (!credentials) throw new Error('Authentication cancelled');
    return credentials.token.accessToken;
  }

  /** Throws when the server is unreachable or rejects the API key. */
  async verify(apiKey: string, serverUrl: string): Promise<KavitaPluginAuth> {
    const url = `/api/Plugin/authenticate?apiKey=${encodeURIComponent(apiKey)}&pluginName=Aniseekr`;
    return this.request<KavitaPluginAuth>(url, apiKey, serverUrl, { method: 'POST' });
  }

  async fetchUserList(token: string): Promise<UniversalAnimeItem[]> {
    const credentials = authService.getCredentials('kavita');
    if (!credentials?.serverUrl) throw new Error('Kavita server URL not configured');

    const baseUrl = credentials.serverUrl;

    // Kavita 0.8+: the old GET /api/Series/all is gone; all-v2 is a paged POST with a filter body.
    const seriesList: KavitaSeries[] = [];
    for (let page = 1; ; page++) {
      const batch = await this.request<KavitaSeries[]>(
        `/api/Series/all-v2?PageNumber=${page}&PageSize=${PAGE_SIZE}`,
        token,
        baseUrl,
        {
          method: 'POST',
          body: JSON.stringify({ statements: [], combination: 1, limitTo: 0 }),
        }
      );
      seriesList.push(...batch);
      if (batch.length < PAGE_SIZE) break;
    }

    return seriesList.map((item) => this.mapEntry(item, baseUrl, token));
  }

  async fetchUserProfile(token: string): Promise<ImportedUserProfile> {
    const credentials = authService.getCredentials('kavita');
    if (!credentials?.serverUrl) throw new Error('Kavita server URL not configured');

    const user = await this.verify(token, credentials.serverUrl);

    return {
      username: user.username,
      avatarUrl: undefined,
      sourcePlatform: 'kavita',
    };
  }

  private mapEntry(item: KavitaSeries, baseUrl: string, token: string): UniversalAnimeItem {
    let status: AnimeStatus = 'planned';
    if (item.pagesRead > 0) {
      if (item.pagesRead >= item.pages && item.pages > 0) {
        status = 'completed';
      } else {
        status = 'watching';
      }
    }

    const imageUrl = `${baseUrl.replace(/\/$/, '')}/api/image/series-cover?seriesId=${item.id}&apiKey=${token}`;

    return {
      id: `kavita_${item.id}`,
      platformIds: { kavita: String(item.id) },
      title: item.name,
      titleEnglish: item.originalName,
      imageUrl,
      status,
      progress: item.pagesRead,
      totalEpisodes: item.pages,
      score: undefined,
      updatedAt: new Date(),
      source: 'kavita',
    };
  }
}

export const kavitaProvider = new KavitaProvider();
