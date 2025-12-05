import { AniListClient, AniListAnime } from "./anilist-client";
import { Anime, Genre, Photo } from "../components/rate/types";

export class AnimeRepository {
  static async getTopAnime(page = 1): Promise<Anime[]> {
    const data = await AniListClient.getTopAnime(page);
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

    const data = await AniListClient.getSeasonalAnime(targetSeason, targetYear, page);
    return data.map(this.mapAniListDetailToAnime);
  }

  static async searchAnime(query: string, page = 1): Promise<Anime[]> {
    const data = await AniListClient.searchAnime(query, page);
    return data.map(this.mapAniListToAnime);
  }

  static async getAnimeByGenre(genre: string, page = 1): Promise<Anime[]> {
    const data = await AniListClient.getAnimeByGenre(genre, page);
    return data.map(this.mapAniListToAnime);
  }

  static async getGenres(): Promise<Genre[]> {
    const genres = await AniListClient.getGenres();
    // Helper to get image for genre
    const genresWithImages: Genre[] = await Promise.all(
      genres.slice(0, 20).map(async (name) => { // Limit to 20 to avoid rate limits
        try {
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
    return genresWithImages;
  }

  static async getAnimeDetails(id: string): Promise<Anime> {
    const data = await AniListClient.getAnimeDetails(Number(id));
    return this.mapAniListDetailToAnime(data);
  }

  // --- Mappers ---

  private static mapAniListToAnime(item: AniListAnime): Anime {
    return {
      id: String(item.id),
      title: item.title.english || item.title.romaji || item.title.native || "Unknown Title",
      image: item.coverImage.extraLarge || item.coverImage.large,
      rank: item.averageScore || 0,
      tags: item.genres.slice(0, 3), 
      mood: item.description ? item.description.replace(/<[^>]*>?/gm, '').substring(0, 100) + "..." : "", 
      durationMinutes: item.duration || 24,
    };
  }

  private static mapAniListDetailToAnime(item: AniListAnime): Anime {
    // Defines a richer object if needed, for now reusing Anime type but ideally we extend it
    // I should probably extend the Anime type in types.ts too, but for now passing extra data via 'mood' or just mapping basics.
    // To do it right, I will stick to Anime type but ensure it has what we need or update types.ts.
    // The current Anime type is minimal. I'll stick to it conformant to the interface.
    // We should rely on a separate specific type for details if checking types.ts showed limitations.
    // However, I will rely on the mapped object potentially having more fields if I used 'any' or intersection, 
    // but Typescript will complain.
    // Let's return Anime for now, but I will assume we might cast it in the View or update Type later.
    return {
      id: String(item.id),
      title: item.title.english || item.title.romaji || item.title.native || "Unknown Title",
      image: item.coverImage.extraLarge || item.coverImage.large,
      rank: item.averageScore || 0,
      tags: item.genres,
      mood: item.description ? item.description : "", // Full description
      durationMinutes: item.duration || 24,
      // We are missing fields like 'streaming', 'relations' in the base Anime type.
      // I'll add them to the implementation even if type doesn't say so, 
      // or better: I will update types.ts in the next step.
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
