import { AniListClient, AniListAnime } from "../clients/anilist-client";
import { Anime, Genre, Photo } from "../../components/rate/types";
import { LocalDB } from "../db";
import { CacheService } from "../services/cache-service";

const CACHE_TTL_LIST = 3600 * 1000; // 1 hour
const CACHE_TTL_DETAIL = 24 * 3600 * 1000; // 24 hours

export class AnimeRepository {
  static async getTopAnime(page = 1): Promise<Anime[]> {
    const cacheKey = `top_anime_${page}`;
    const cached = await CacheService.get<AniListAnime[]>(cacheKey);
    if (cached) return cached.map(this.mapAniListToAnime);

    const data = await AniListClient.getTopAnime(page);
    await CacheService.set(cacheKey, data, CACHE_TTL_LIST);
    return data.map(this.mapAniListToAnime);
  }

  static async getSeasonalAnime(season?: string, year?: number, page = 1): Promise<Anime[]> {
    // Determine current season and year if not provided
    const date = new Date();
    const currentMonth = date.getMonth();
    const currentYear = date.getFullYear();
    
    let targetSeason = season;
    if (!targetSeason) {
        if (currentMonth >= 2 && currentMonth <= 4) targetSeason = "SPRING";
        else if (currentMonth >= 5 && currentMonth <= 7) targetSeason = "SUMMER";
        else if (currentMonth >= 8 && currentMonth <= 10) targetSeason = "FALL";
        else targetSeason = "WINTER";
    }

    const targetYear = year || currentYear;
    const cacheKey = `seasonal_${targetSeason}_${targetYear}_${page}`;
    
    const cached = await CacheService.get<AniListAnime[]>(cacheKey);
    if (cached) return cached.map(this.mapAniListDetailToAnime);

    const data = await AniListClient.getSeasonalAnime(targetSeason, targetYear, page);
    await CacheService.set(cacheKey, data, CACHE_TTL_LIST);
    return data.map(this.mapAniListDetailToAnime);
  }

  static async searchAnime(query: string, page = 1): Promise<Anime[]> {
    // Search is fast-changing/user-specific, maybe short cache or no cache?
    // Let's cache for 5 mins to avoid rapid re-search of same term
    const cacheKey = `search_${query}_${page}`;
    const cached = await CacheService.get<AniListAnime[]>(cacheKey);
    if (cached) return cached.map(this.mapAniListToAnime);

    const data = await AniListClient.searchAnime(query, page);
    await CacheService.set(cacheKey, data, 5 * 60 * 1000); 
    return data.map(this.mapAniListToAnime);
  }

  static async getAnimeByGenre(genre: string, page = 1): Promise<Anime[]> {
    const cacheKey = `genre_${genre}_${page}`;
    const cached = await CacheService.get<AniListAnime[]>(cacheKey);
    if (cached) return cached.map(this.mapAniListToAnime);

    const data = await AniListClient.getAnimeByGenre(genre, page);
    await CacheService.set(cacheKey, data, CACHE_TTL_LIST);
    return data.map(this.mapAniListToAnime);
  }

  static async getGenres(): Promise<Genre[]> {
    const cacheKey = `genres_list_v2`;
    const cached = await CacheService.get<Genre[]>(cacheKey);
    if (cached) return cached;

    const genres = await AniListClient.getGenres();
    
    // Helper to get image for genre
    const genresWithImages: Genre[] = await Promise.all(
      genres.slice(0, 20).map(async (name) => { // Limit to 20 to avoid rate limits
        try {
          // Inner detail fetch could also be cached individually or we rely on this aggregate cache
          const anime = await AniListClient.getAnimeByGenre(name, 1, 1);
          const image = anime[0]?.coverImage?.extraLarge || anime[0]?.coverImage?.large || "";
          return {
            id: name,
            displayName: name,
            image,
          };
        } catch (e) {
          return {
            id: name,
            displayName: name,
            image: "",
          };
        }
      })
    );
    
    await CacheService.set(cacheKey, genresWithImages, 24 * 3600 * 1000); // 24 hours for genres
    return genresWithImages;
  }

  static async getAnimeDetails(id: string): Promise<Anime> {
    const cacheKey = `anime_detail_${id}`;
    const cached = await CacheService.get<AniListAnime>(cacheKey);
    if (cached) return this.mapAniListDetailToAnime(cached);

    const data = await AniListClient.getAnimeDetails(Number(id));
    await CacheService.set(cacheKey, data, CACHE_TTL_DETAIL);
    return this.mapAniListDetailToAnime(data);
  }

  static async rateAnime(id: string, action: 'like' | 'pass'): Promise<void> {
    console.log(`[Repository] Rated anime ${id}: ${action}`);
    await LocalDB.addRating(id, action);
    if (action === 'like') {
        const anime = await this.getAnimeDetails(id);
        await LocalDB.addFavorite({
            id: anime.id,
            title: anime.title,
            image: anime.image
        });
    }
  }

  static async getCollection(): Promise<Anime[]> {
    const favorites = await LocalDB.getFavorites();
    // Convert favorite items to simplified Anime objects
    return favorites.map(fav => ({
        id: fav.id,
        title: fav.title,
        image: fav.image,
        rank: 0, // Not stored in simplified favs
        tags: [],
        mood: "",
        durationMinutes: 0
    }));
  }

  static async getUserStats() {
    return await LocalDB.getStats();
  }

  // --- Mappers ---

  private static mapAniListToAnime(item: AniListAnime): Anime {
    return {
      id: String(item.id),
      title: item.title.english || item.title.romaji || item.title.native || "Unknown Title",
      image: item.coverImage.extraLarge || item.coverImage.large,
      rank: item.averageScore || 0, // Keeping for backward compat if used elsewhere? Or rename this?
      score: item.averageScore || 0,
      type: item.format || "TV",
      tags: item.genres.slice(0, 3), 
      mood: item.description ? item.description.replace(/<[^>]*>?/gm, '').substring(0, 100) + "..." : "", 
      durationMinutes: item.duration || 24,
    };
  }

  private static mapAniListDetailToAnime(item: AniListAnime): Anime {
    return {
      id: String(item.id),
      title: item.title.english || item.title.romaji || item.title.native || "Unknown Title",
      image: item.coverImage.extraLarge || item.coverImage.large,
      bannerImage: item.bannerImage || undefined,
      rank: item.averageScore || 0,
      score: item.averageScore ?? undefined,
      type: item.format || "TV",
      tags: item.genres,
      mood: item.description ? item.description.replace(/<[^>]*>?/gm, '') : "",
      description: item.description ? item.description.replace(/<[^>]*>?/gm, '') : undefined,
      durationMinutes: item.duration || 24,
      studios: item.studios?.nodes?.map(node => node.name) || undefined,
      startDate: item.startDate || undefined,
      status: item.status || undefined,
      format: item.format || undefined,
      nextAiringEpisode: item.nextAiringEpisode ? {
        airingAt: item.nextAiringEpisode.airingAt,
        episode: item.nextAiringEpisode.episode,
      } : undefined,
    };
  }

  static mapAnimeToPhoto(anime: Anime): Photo {
    return {
      id: anime.id,
      url: anime.image,
      userId: "anilist",
      title: anime.title,
      tags: anime.tags,
      score: anime.rank,
      year: new Date().getFullYear(), // Placeholder
      type: "Anime",
    };
  }
}
