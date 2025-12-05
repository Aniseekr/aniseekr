import { JikanClient } from "./jikan-client";
import { Anime, Genre, Photo } from "../components/rate/types";

// Types for Jikan API Responses
interface JikanResponse<T> {
  data: T;
  pagination: {
    last_visible_page: number;
    has_next_page: boolean;
  };
}

interface JikanAnime {
  mal_id: number;
  title: string;
  images: {
    jpg: { image_url: string; large_image_url: string };
    webp: { image_url: string; large_image_url: string };
  };
  score: number;
  genres: Array<{ mal_id: number; name: string }>;
  themes: Array<{ mal_id: number; name: string }>;
  demographics: Array<{ mal_id: number; name: string }>;
  duration: string;
  synopsis: string;
}

interface JikanGenre {
  mal_id: number;
  name: string;
  count: number;
}

export class AnimeRepository {
  static async getTopAnime(page = 1): Promise<Anime[]> {
    const response = await JikanClient.get<JikanResponse<JikanAnime[]>>("/top/anime", { page });
    return response.data.map(this.mapJikanToAnime);
  }

  static async getSeasonalAnime(page = 1): Promise<Anime[]> {
    const response = await JikanClient.get<JikanResponse<JikanAnime[]>>("/seasons/now", { page, sfw: true });
    return response.data.map(this.mapJikanToAnime);
  }

  static async searchAnime(query: string, page = 1): Promise<Anime[]> {
    const response = await JikanClient.get<JikanResponse<JikanAnime[]>>("/anime", { q: query, page, sfw: true });
    return response.data.map(this.mapJikanToAnime);
  }

  static async getAnimeByGenre(genreId: number, page = 1): Promise<Anime[]> {
    const response = await JikanClient.get<JikanResponse<JikanAnime[]>>("/anime", { genres: genreId, page, sfw: true });
    return response.data.map(this.mapJikanToAnime);
  }

  static async getGenres(): Promise<Genre[]> {
    const response = await JikanClient.get<JikanResponse<JikanGenre[]>>("/genres/anime");
    return response.data.map((g) => ({
      id: String(g.mal_id),
      displayName: g.name,
      image: "", // Jikan genres don't have images default
    }));
  }

  // --- Mappers ---

  private static mapJikanToAnime(item: JikanAnime): Anime {
    const tags = [
      ...(item.genres?.map((g) => g.name) || []),
      ...(item.themes?.map((t) => t.name) || []),
      ...(item.demographics?.map((d) => d.name) || []),
    ];

    return {
      id: String(item.mal_id),
      title: item.title,
      image: item.images.webp.large_image_url || item.images.jpg.large_image_url,
      rank: item.score, // Using score as rank for now
      tags: tags.slice(0, 3), // Top 3 tags
      durationMinutes: 24, // Approximation or parse `item.duration`
      // Extra fields for Photo logic
      mood: item.synopsis, // Mapping synopsis to mood temporarily for types compatibility if needed
    };
  }

  static mapAnimeToPhoto(anime: Anime): Photo {
    return {
      id: anime.id,
      url: anime.image,
      userId: "jikan",
      title: anime.title,
      tags: anime.tags,
      score: anime.rank,
      year: 2024, // Placeholder if Anime type doesn't have it yet, or add it to Anime type
    };
  }
}
