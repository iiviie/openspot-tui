/**
 * Cache Service
 * In-memory caching with TTL and invalidation support
 */

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
}

export interface CacheOptions {
  ttl?: number; // Default TTL in milliseconds
}

/**
 * Generic cache service with TTL and invalidation
 */
export class CacheService {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private defaultTTL: number;

  constructor(options: CacheOptions = {}) {
    this.defaultTTL = options.ttl || 5 * 60 * 1000; // Default 5 minutes
  }

  /**
   * Store data in cache with optional custom TTL
   */
  set<T>(key: string, data: T, ttl?: number): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTTL,
    });
  }

  /**
   * Get data from cache if valid
   * Returns null if not found or expired
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }

    // Check if expired
    const age = Date.now() - entry.timestamp;
    if (age > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  /**
   * Check if cache has valid entry for key
   */
  has(key: string): boolean {
    return this.get(key) !== null;
  }

  /**
   * Invalidate specific cache key
   */
  invalidate(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Invalidate multiple keys matching a pattern
   * Pattern is a prefix match (e.g., "playlists:" invalidates all playlist keys)
   */
  invalidatePattern(pattern: string): void {
    const keysToDelete: string[] = [];
    
    for (const key of this.cache.keys()) {
      if (key.startsWith(pattern)) {
        keysToDelete.push(key);
      }
    }
    
    keysToDelete.forEach(key => this.cache.delete(key));
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    keys: string[];
    entries: Array<{ key: string; age: number; ttl: number }>;
  } {
    const now = Date.now();
    const entries: Array<{ key: string; age: number; ttl: number }> = [];

    for (const [key, entry] of this.cache.entries()) {
      entries.push({
        key,
        age: now - entry.timestamp,
        ttl: entry.ttl,
      });
    }

    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
      entries,
    };
  }

  /**
   * Remove expired entries (garbage collection)
   */
  cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      const age = now - entry.timestamp;
      if (age > entry.ttl) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => this.cache.delete(key));
  }

  /**
   * Get or fetch pattern:
   * - Try to get from cache
   * - If not found, fetch using provided function
   * - Store in cache and return
   */
  async getOrFetch<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    // Try cache first
    const cached = this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // Fetch fresh data
    const data = await fetchFn();
    
    // Store in cache
    this.set(key, data, ttl);
    
    return data;
  }
}

// Singleton instance for the app
let cacheServiceInstance: CacheService | null = null;

export function getCacheService(): CacheService {
  if (!cacheServiceInstance) {
    cacheServiceInstance = new CacheService({
      ttl: 5 * 60 * 1000, // 5 minutes default
    });
    
    // Setup periodic cleanup (every 10 minutes)
    setInterval(() => {
      cacheServiceInstance?.cleanup();
    }, 10 * 60 * 1000);
  }
  return cacheServiceInstance;
}

/**
 * Cache key builders for consistency
 */
export const CacheKeys = {
  // Library
  savedTracks: (limit: number, offset: number) => `saved-tracks:${limit}:${offset}`,
  playlists: (limit: number, offset: number) => `playlists:${limit}:${offset}`,
  playlistTracks: (playlistId: string, limit: number, offset: number) => 
    `playlist-tracks:${playlistId}:${limit}:${offset}`,
  
  // Albums
  albumTracks: (albumId: string) => `album-tracks:${albumId}`,
  
  // Artists
  artistTopTracks: (artistId: string) => `artist-top-tracks:${artistId}`,
  
  // Search (shorter TTL)
  search: (query: string, type: string, limit: number) => 
    `search:${type}:${query}:${limit}`,
} as const;

/**
 * TTL configurations for different data types
 */
export const CacheTTL = {
  SHORT: 2 * 60 * 1000,      // 2 minutes - for search results
  MEDIUM: 5 * 60 * 1000,     // 5 minutes - default
  LONG: 15 * 60 * 1000,      // 15 minutes - for rarely changing data
  VERY_LONG: 60 * 60 * 1000, // 1 hour - for static data
} as const;
