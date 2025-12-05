const ANILIST_ENDPOINT = 'https://graphql.anilist.co';

export interface AniListAnime {
  id: number;
  idMal: number | null;
  title: {
    romaji: string;
    english: string | null;
    native: string | null;
  };
  coverImage: {
    large: string;
    extraLarge: string;
    color: string | null;
  };
  bannerImage: string | null;
  averageScore: number | null;
  popularity: number;
  description: string | null;
  format: string | null;
  episodes: number | null;
  duration: number | null;
  status: string | null;
  season: string | null;
  seasonYear: number | null;
  genres: string[];
  tags: Array<{
    name: string;
    rank: number;
    description: string | null;
    category: string | null;
  }>;
  studios: {
    nodes: Array<{
      name: string;
    }>;
  };
  startDate: {
    year: number | null;
    month: number | null;
    day: number | null;
  };
  nextAiringEpisode: {
    airingAt: number;
    episode: number;
  } | null;
}

interface AniListPage<T> {
  Page: {
    pageInfo: {
      total: number;
      perPage: number;
      currentPage: number;
      lastPage: number;
      hasNextPage: boolean;
    };
    media: T[];
  };
}

interface GenreCollectionResponse {
  GenreCollection: string[];
}

export class AniListClient {
  private static async fetch<T>(query: string, variables: any = {}): Promise<T> {
    const response = await fetch(ANILIST_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables,
      }),
    });

    if (!response.ok) {
      throw new Error(`AniList API Error: ${response.status} ${response.statusText}`);
    }

    const json = await response.json();
    if (json.errors) {
      throw new Error(`AniList GraphQL Error: ${JSON.stringify(json.errors)}`);
    }

    return json.data;
  }

  static async getTopAnime(page = 1, perPage = 20): Promise<AniListAnime[]> {
    const query = `
      query ($page: Int, $perPage: Int) {
        Page(page: $page, perPage: $perPage) {
          media(sort: [POPULARITY_DESC], type: ANIME) {
            ...mediaFields
          }
        }
      }
      ${MEDIA_FRAGMENT}
    `;
    const data = await this.fetch<AniListPage<AniListAnime>>(query, { page, perPage });
    return data.Page.media;
  }

  static async getTrendingAnime(page = 1, perPage = 20): Promise<AniListAnime[]> {
    const query = `
      query ($page: Int, $perPage: Int) {
        Page(page: $page, perPage: $perPage) {
          media(sort: [TRENDING_DESC], type: ANIME) {
            ...mediaFields
          }
        }
      }
      ${MEDIA_FRAGMENT}
    `;
    const data = await this.fetch<AniListPage<AniListAnime>>(query, { page, perPage });
    return data.Page.media;
  }

  static async getSeasonalAnime(season: string, year: number, page = 1, perPage = 20): Promise<AniListAnime[]> {
    const query = `
      query ($page: Int, $perPage: Int, $season: MediaSeason, $seasonYear: Int) {
        Page(page: $page, perPage: $perPage) {
          media(season: $season, seasonYear: $seasonYear, type: ANIME, sort: [POPULARITY_DESC]) {
            ...mediaFields
          }
        }
      }
      ${MEDIA_FRAGMENT}
    `;
    const data = await this.fetch<AniListPage<AniListAnime>>(query, { 
      page, 
      perPage, 
      season: season.toUpperCase(), 
      seasonYear: year 
    });
    return data.Page.media;
  }

  static async searchAnime(search: string, page = 1, perPage = 20): Promise<AniListAnime[]> {
    const query = `
      query ($page: Int, $perPage: Int, $search: String) {
        Page(page: $page, perPage: $perPage) {
          media(search: $search, type: ANIME, sort: [POPULARITY_DESC]) {
            ...mediaFields
          }
        }
      }
      ${MEDIA_FRAGMENT}
    `;
    const data = await this.fetch<AniListPage<AniListAnime>>(query, { page, perPage, search });
    return data.Page.media;
  }

  static async getAnimeByGenre(genre: string, page = 1, perPage = 20): Promise<AniListAnime[]> {
    const query = `
      query ($page: Int, $perPage: Int, $genre: String) {
        Page(page: $page, perPage: $perPage) {
          media(genre: $genre, type: ANIME, sort: [POPULARITY_DESC]) {
            ...mediaFields
          }
        }
      }
      ${MEDIA_FRAGMENT}
    `;
    const data = await this.fetch<AniListPage<AniListAnime>>(query, { page, perPage, genre });
    return data.Page.media;
  }

  static async getAnimeDetails(id: number): Promise<AniListAnime> {
    const query = `
      query ($id: Int) {
        Media(id: $id, type: ANIME) {
          ...mediaFields
          description
          startDate {
            year
            month
            day
          }
        }
      }
      ${MEDIA_FRAGMENT}
    `;
    const data = await this.fetch<{ Media: AniListAnime }>(query, { id });
    return data.Media;
  }

  static async getGenres(): Promise<string[]> {
    const query = `
      query {
        GenreCollection
      }
    `;
    const data = await this.fetch<GenreCollectionResponse>(query);
    return data.GenreCollection;
  }
}

const MEDIA_FRAGMENT = `
  fragment mediaFields on Media {
    id
    idMal
    title {
      romaji
      english
      native
    }
    coverImage {
      large
      extraLarge
      color
    }
    bannerImage
    averageScore
    meanScore
    popularity
    format
    episodes
    duration
    status
    season
    seasonYear
    genres
    tags {
      name
      rank
      description
      category
    }
    studios(isMain: true) {
      nodes {
        name
      }
    }
    nextAiringEpisode {
      airingAt
      episode
    }
  }
`;
