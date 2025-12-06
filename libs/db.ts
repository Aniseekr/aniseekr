import * as SQLite from 'expo-sqlite';

const DB_NAME = 'aniseekr.db';

export interface FavoriteItem {
  id: string;
  title: string;
  image: string;
  addedAt: number;
}

export interface RatingItem {
  id: string; // animeId
  rating: 'like' | 'pass';
  timestamp: number;
}

export interface UserStats {
  totalRated: number;
  likedCount: number;
}

let db: SQLite.SQLiteDatabase | null = null;

export const LocalDB = {
  async init() {
    if (db) return;
    db = await SQLite.openDatabaseAsync(DB_NAME);
    
    // Create tables
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS favorites (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT,
        image TEXT,
        addedAt INTEGER
      );
      CREATE TABLE IF NOT EXISTS ratings (
        id TEXT PRIMARY KEY NOT NULL,
        rating TEXT,
        timestamp INTEGER
      );
    `);
    console.log('[LocalDB] Initialized');
  },

  async addFavorite(anime: { id: string; title: string; image: string }) {
    if (!db) await this.init();
    await db?.runAsync(
      'INSERT OR REPLACE INTO favorites (id, title, image, addedAt) VALUES (?, ?, ?, ?)',
      anime.id, anime.title, anime.image || "", Date.now()
    );
  },

  async removeFavorite(animeId: string) {
    if (!db) await this.init();
    await db?.runAsync('DELETE FROM favorites WHERE id = ?', animeId);
  },

  async getFavorites(): Promise<FavoriteItem[]> {
    if (!db) await this.init();
    const result = await db?.getAllAsync<FavoriteItem>('SELECT * FROM favorites ORDER BY addedAt DESC');
    return result || [];
  },

  async isFavorite(animeId: string): Promise<boolean> {
    if (!db) await this.init();
    const result = await db?.getFirstAsync('SELECT id FROM favorites WHERE id = ?', animeId);
    return !!result;
  },

  async addRating(animeId: string, rating: 'like' | 'pass') {
    if (!db) await this.init();
    await db?.runAsync(
      'INSERT OR REPLACE INTO ratings (id, rating, timestamp) VALUES (?, ?, ?)',
      animeId, rating, Date.now()
    );
  },

  async getStats(): Promise<UserStats> {
    if (!db) await this.init();
    const totalResult = await db?.getFirstAsync<{count: number}>('SELECT COUNT(*) as count FROM ratings');
    const likedResult = await db?.getFirstAsync<{count: number}>('SELECT COUNT(*) as count FROM ratings WHERE rating = "like"');
    
    return {
      totalRated: totalResult?.count || 0,
      likedCount: likedResult?.count || 0,
    };
  }
};
