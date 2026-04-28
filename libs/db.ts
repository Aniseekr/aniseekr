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

export interface PilgrimageRow {
  bangumi_id: number;
  title: string;
  title_cn: string | null;
  city: string | null;
  cover: string | null;
  color: string | null;
  center_lat: number | null;
  center_lng: number | null;
  zoom: number | null;
  points_length: number | null;
  images_length: number | null;
  lite_points_json: string | null;
  cached_at: number;
  expires_at: number;
}

export interface PilgrimageSaveInput {
  bangumiId: number;
  title: string;
  titleCn?: string | null;
  city?: string | null;
  cover?: string | null;
  color?: string | null;
  centerLat?: number | null;
  centerLng?: number | null;
  zoom?: number | null;
  pointsLength?: number | null;
  imagesLength?: number | null;
  litePointsJson?: string | null;
  cachedAt: number;
  expiresAt: number;
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
      CREATE TABLE IF NOT EXISTS id_mappings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mal_id INTEGER,
        anilist_id INTEGER,
        kitsu_id INTEGER,
        bangumi_id INTEGER,
        shikimori_id INTEGER,
        simkl_id INTEGER,
        annict_id INTEGER,
        thetvdb_id INTEGER,
        themoviedb_id INTEGER,
        livechart_id INTEGER,
        anime_planet_id TEXT,
        anisearch_id INTEGER,
        notify_moe_id TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_mal_id ON id_mappings(mal_id);
      CREATE INDEX IF NOT EXISTS idx_anilist_id ON id_mappings(anilist_id);
      CREATE INDEX IF NOT EXISTS idx_kitsu_id ON id_mappings(kitsu_id);

      CREATE TABLE IF NOT EXISTS user_anime (
        anime_id TEXT PRIMARY KEY NOT NULL,
        title TEXT,
        image_url TEXT,
        status TEXT NOT NULL,
        score INTEGER,
        progress INTEGER DEFAULT 0,
        total_episodes INTEGER,
        started_at INTEGER,
        completed_at INTEGER,
        updated_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_status ON user_anime(status);

      CREATE TABLE IF NOT EXISTS collection_folders (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        icon TEXT,
        type TEXT NOT NULL,
        is_shared INTEGER DEFAULT 0,
        is_r18 INTEGER DEFAULT 0,
        created_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS collection_folder_items (
        folder_id TEXT NOT NULL,
        anime_id TEXT NOT NULL,
        added_at INTEGER,
        PRIMARY KEY (folder_id, anime_id),
        FOREIGN KEY (folder_id) REFERENCES collection_folders (id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS pilgrimage_spots (
        bangumi_id INTEGER PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        title_cn TEXT,
        city TEXT,
        cover TEXT,
        color TEXT,
        center_lat REAL,
        center_lng REAL,
        zoom INTEGER,
        points_length INTEGER,
        images_length INTEGER,
        lite_points_json TEXT,
        cached_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_pilg_city ON pilgrimage_spots(city);
      CREATE INDEX IF NOT EXISTS idx_pilg_expires ON pilgrimage_spots(expires_at);
    `);
    console.log('[LocalDB] Initialized');
  },

  async getDatabase(): Promise<SQLite.SQLiteDatabase> {
    if (!db) await this.init();
    return db!;
  },

  async addFavorite(anime: { id: string; title: string; image: string }) {
    if (!db) await this.init();
    await db?.runAsync(
      'INSERT OR REPLACE INTO favorites (id, title, image, addedAt) VALUES (?, ?, ?, ?)',
      anime.id,
      anime.title,
      anime.image || '',
      Date.now()
    );
  },

  async removeFavorite(animeId: string) {
    if (!db) await this.init();
    await db?.runAsync('DELETE FROM favorites WHERE id = ?', animeId);
  },

  async getFavorites(): Promise<FavoriteItem[]> {
    if (!db) await this.init();
    const result = await db?.getAllAsync<FavoriteItem>(
      'SELECT * FROM favorites ORDER BY addedAt DESC'
    );
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
      animeId,
      rating,
      Date.now()
    );
  },

  async getStats(): Promise<UserStats> {
    if (!db) await this.init();
    const totalResult = await db?.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM ratings'
    );
    const likedResult = await db?.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM ratings WHERE rating = "like"'
    );

    return {
      totalRated: totalResult?.count || 0,
      likedCount: likedResult?.count || 0,
    };
  },

  async getPilgrimage(bangumiId: number): Promise<PilgrimageRow | null> {
    if (!db) await this.init();
    const row = await db?.getFirstAsync<PilgrimageRow>(
      'SELECT * FROM pilgrimage_spots WHERE bangumi_id = ?',
      bangumiId
    );
    return row ?? null;
  },

  async savePilgrimage(entry: PilgrimageSaveInput): Promise<void> {
    if (!db) await this.init();
    await db?.runAsync(
      `INSERT OR REPLACE INTO pilgrimage_spots (
        bangumi_id, title, title_cn, city, cover, color,
        center_lat, center_lng, zoom,
        points_length, images_length, lite_points_json,
        cached_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      entry.bangumiId,
      entry.title,
      entry.titleCn ?? null,
      entry.city ?? null,
      entry.cover ?? null,
      entry.color ?? null,
      entry.centerLat ?? null,
      entry.centerLng ?? null,
      entry.zoom ?? null,
      entry.pointsLength ?? null,
      entry.imagesLength ?? null,
      entry.litePointsJson ?? null,
      entry.cachedAt,
      entry.expiresAt
    );
  },

  async cleanExpiredPilgrimage(now: number = Date.now()): Promise<number> {
    if (!db) await this.init();
    const result = await db?.runAsync(
      'DELETE FROM pilgrimage_spots WHERE expires_at <= ?',
      now
    );
    return result?.changes ?? 0;
  },
};
