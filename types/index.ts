export interface CollectionFolder {
  id: string;
  name: string;
  icon: string;
  /** Dormant: folder sharing has no backend. Persisted but never surfaced in UI. */
  isShared: boolean;
  isSystemFolder: boolean;
  isR18: boolean;
  folderType: 'custom' | 'wishlist' | 'favorites' | 'watching' | 'completed' | 'dropped' | 'all';
  createdAt: Date;
  animeCount: number;
  /** Dormant: always 0 (no share backend). Kept for schema/backup parity. */
  sharedBy: number;
  sortOrder?: number;
  coverUrl?: string;
}
