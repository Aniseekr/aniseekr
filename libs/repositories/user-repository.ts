import { JikanClient } from "../clients/jikan-client";
import { AnimeRepository } from "./anime-repository";

export interface UserProfile {
  id: string;
  username: string;
  avatarUrl: string;
  isDonator: boolean;
  stats: {
    totalRated: number;
    likedCount: number;
    cardsCount: number;
    foldersCount: number;
  };
}

// Simulates a user repository. 
// In the future this will connect to AniList or a local database.
export class UserRepository {
  static async getProfile(): Promise<UserProfile> {
    const stats = await AnimeRepository.getUserStats();

    return {
      id: "u1",
      username: "Kidney", // Or fetch from local storage
      avatarUrl: "https://github.com/kidney.png",
      isDonator: true,
      stats: {
        totalRated: stats.totalRated,
        likedCount: stats.likedCount,
        cardsCount: 0,
        foldersCount: 1 // Default
      }
    };
  }

  // Placeholder for future update
  static async updateProfile(data: Partial<UserProfile>): Promise<void> {
    // Save to local storage or API
  }
}
