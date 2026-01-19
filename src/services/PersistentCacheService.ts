/**
 * Persistent Cache Service
 * Saves cache to disk for instant startup (stale-while-revalidate pattern)
 */

import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { getLogger } from "../utils";

const logger = getLogger("PersistentCache");

const CACHE_DIR = join(homedir(), ".spotify-tui", "cache");

export interface PersistentCacheEntry<T> {
	data: T;
	timestamp: number;
}

/**
 * Persistent cache that saves to disk
 * Uses stale-while-revalidate: show old data instantly, refresh in background
 */
export class PersistentCacheService {
	constructor() {
		// Ensure cache directory exists
		if (!existsSync(CACHE_DIR)) {
			mkdirSync(CACHE_DIR, { recursive: true });
		}
	}

	/**
	 * Get cache file path for a key
	 */
	private getCacheFilePath(key: string): string {
		// Sanitize key for filesystem
		const sanitized = key.replace(/[^a-z0-9-_]/gi, "_");
		return join(CACHE_DIR, `${sanitized}.json`);
	}

	/**
	 * Get data from disk cache
	 * Returns null if not found or parsing fails
	 */
	get<T>(key: string): T | null {
		const filePath = this.getCacheFilePath(key);

		try {
			if (!existsSync(filePath)) {
				return null;
			}

			const content = readFileSync(filePath, "utf-8");
			const entry: PersistentCacheEntry<T> = JSON.parse(content);

			return entry.data;
		} catch (error) {
			logger.warn(`Failed to read cache for ${key}:`, error);
			return null;
		}
	}

	/**
	 * Save data to disk cache
	 */
	set<T>(key: string, data: T): void {
		const filePath = this.getCacheFilePath(key);

		try {
			const entry: PersistentCacheEntry<T> = {
				data,
				timestamp: Date.now(),
			};

			writeFileSync(filePath, JSON.stringify(entry), "utf-8");
		} catch (error) {
			logger.warn(`Failed to write cache for ${key}:`, error);
		}
	}

	/**
	 * Get cache age in milliseconds
	 */
	getAge(key: string): number | null {
		const filePath = this.getCacheFilePath(key);

		try {
			if (!existsSync(filePath)) {
				return null;
			}

			const content = readFileSync(filePath, "utf-8");
			const entry: PersistentCacheEntry<unknown> = JSON.parse(content);

			return Date.now() - entry.timestamp;
		} catch {
			return null;
		}
	}

	/**
	 * Check if cache exists
	 */
	has(key: string): boolean {
		return this.get(key) !== null;
	}

	/**
	 * Delete cache entry
	 */
	delete(key: string): void {
		const filePath = this.getCacheFilePath(key);
		try {
			if (existsSync(filePath)) {
				unlinkSync(filePath);
			}
		} catch (error) {
			logger.warn(`Failed to delete cache for ${key}:`, error);
		}
	}

	/**
	 * Clear all cached data
	 * Deletes all cache files from disk
	 */
	clearAll(): void {
		try {
			if (!existsSync(CACHE_DIR)) {
				return;
			}

			const files = readdirSync(CACHE_DIR);
			for (const file of files) {
				const filePath = join(CACHE_DIR, file);
				try {
					unlinkSync(filePath);
				} catch (error) {
					logger.warn(`Failed to delete cache file ${file}:`, error);
				}
			}

			logger.info("Cleared all persistent cache");
		} catch (error) {
			logger.error("Failed to clear persistent cache:", error);
		}
	}
}

// Singleton instance
let instance: PersistentCacheService | null = null;

export function getPersistentCache(): PersistentCacheService {
	if (!instance) {
		instance = new PersistentCacheService();
	}
	return instance;
}

/**
 * Persistent cache keys
 */
export const PersistentCacheKeys = {
	savedTracks: () => "saved_tracks",
	playlists: () => "playlists",
	USER_PROFILE_DISPLAY_NAME: "user_profile_display_name",
} as const;
