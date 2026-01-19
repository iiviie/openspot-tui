/**
 * Spotify Web API Service
 * Handles all Spotify Web API calls for search, playback, library, etc.
 * Includes runtime validation with Zod and caching for better performance.
 */

import type { z } from "zod";
import {
	API_LIMITS,
	DEFAULT_MARKET,
	DEFAULT_RATE_LIMIT_RETRY_SECONDS,
	HTTP_STATUS,
	SPOTIFY_API_BASE,
} from "../config/constants";
import {
	PaginatedPlaylistsSchema,
	PaginatedPlaylistTracksSchema,
	PaginatedSavedTracksSchema,
	SearchResultsSchema,
	safeValidate,
} from "../schemas/spotify";
import type {
	SpotifyAlbum,
	SpotifyArtist,
	SpotifyCurrentlyPlaying,
	SpotifyPaginatedResponse,
	SpotifyPlaylist,
	SpotifySavedTrack,
	SpotifySearchResults,
	SpotifyTrack,
} from "../types/spotify";
import { getAuthService, SPOTIFY_CLIENT_ID } from "./AuthService";
import { CacheKeys, CacheTTL, getCacheService } from "./CacheService";

/**
 * Spotify Web API Service with validated responses and caching
 */
export class SpotifyApiService {
	private authService = getAuthService(SPOTIFY_CLIENT_ID);
	private cache = getCacheService();

	/**
	 * Make an authenticated API request with optional validation
	 */
	private async request<T>(
		endpoint: string,
		options: RequestInit = {},
		validator?: z.ZodSchema<T>,
	): Promise<T> {
		const token = await this.authService.getValidAccessToken();

		const response = await fetch(`${SPOTIFY_API_BASE}${endpoint}`, {
			...options,
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
				...options.headers,
			},
		});

		// Handle rate limiting
		if (response.status === HTTP_STATUS.RATE_LIMITED) {
			const retryAfter = parseInt(
				response.headers.get("Retry-After") ??
					String(DEFAULT_RATE_LIMIT_RETRY_SECONDS),
				10,
			);
			throw new Error(`Rate limited. Retry after ${retryAfter} seconds.`);
		}

		// Handle no content responses
		if (response.status === HTTP_STATUS.NO_CONTENT) {
			return {} as T;
		}

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`API error ${response.status}: ${error}`);
		}

		const data = await response.json();

		// Validate response if validator provided
		if (validator) {
			const validated = safeValidate(validator, data, `${endpoint}`);
			if (!validated) {
				throw new Error(`Invalid API response from ${endpoint}`);
			}
			return validated;
		}

		return data as T;
	}

	// ─────────────────────────────────────────────────────────────
	// Search
	// ─────────────────────────────────────────────────────────────

	/**
	 * Search for tracks, artists, albums, or playlists with validation
	 */
	async search(
		query: string,
		types: ("track" | "artist" | "album" | "playlist")[] = ["track"],
		limit: number = API_LIMITS.SEARCH_RESULTS,
	): Promise<SpotifySearchResults> {
		const params = new URLSearchParams({
			q: query,
			type: types.join(","),
			limit: limit.toString(),
		});

		const data = await this.request<unknown>(`/search?${params}`);

		// Validate response
		const validated = safeValidate(SearchResultsSchema, data, "search");
		if (!validated) {
			// Return empty results on validation failure
			return {
				tracks: {
					items: [],
					total: 0,
					limit,
					offset: 0,
					href: "",
					next: null,
					previous: null,
				},
			};
		}

		return validated as SpotifySearchResults;
	}

	/**
	 * Search for tracks only
	 */
	async searchTracks(
		query: string,
		limit: number = API_LIMITS.SEARCH_RESULTS,
	): Promise<SpotifyTrack[]> {
		const results = await this.search(query, ["track"], limit);
		return results.tracks?.items || [];
	}

	/**
	 * Search for artists only
	 */
	async searchArtists(
		query: string,
		limit: number = API_LIMITS.SEARCH_RESULTS,
	): Promise<SpotifyArtist[]> {
		const results = await this.search(query, ["artist"], limit);
		return results.artists?.items || [];
	}

	/**
	 * Search for albums only
	 */
	async searchAlbums(
		query: string,
		limit: number = API_LIMITS.SEARCH_RESULTS,
	): Promise<SpotifyAlbum[]> {
		const results = await this.search(query, ["album"], limit);
		return results.albums?.items || [];
	}

	/**
	 * Search for playlists only
	 */
	async searchPlaylists(
		query: string,
		limit: number = API_LIMITS.SEARCH_RESULTS,
	): Promise<SpotifyPlaylist[]> {
		const results = await this.search(query, ["playlist"], limit);
		return results.playlists?.items || [];
	}

	// ─────────────────────────────────────────────────────────────
	// Playback Control
	// ─────────────────────────────────────────────────────────────

	/**
	 * Get available devices
	 */
	async getDevices(): Promise<{
		devices: Array<{
			id: string;
			name: string;
			is_active: boolean;
			type: string;
		}>;
	}> {
		return this.request("/me/player/devices");
	}

	/**
	 * Get the current playback state
	 */
	async getPlaybackState(): Promise<SpotifyCurrentlyPlaying | null> {
		try {
			return await this.request<SpotifyCurrentlyPlaying>("/me/player");
		} catch {
			return null;
		}
	}

	/**
	 * Start or resume playback
	 * @param options - Play options (uris, context_uri, device_id, etc.)
	 */
	async play(
		options: {
			device_id?: string;
			context_uri?: string; // Album, artist, or playlist URI
			uris?: string[]; // List of track URIs
			offset?: { position: number } | { uri: string };
			position_ms?: number;
		} = {},
	): Promise<void> {
		const params = options.device_id ? `?device_id=${options.device_id}` : "";
		const body: Record<string, unknown> = {};

		if (options.context_uri) body.context_uri = options.context_uri;
		if (options.uris) body.uris = options.uris;
		if (options.offset) body.offset = options.offset;
		if (options.position_ms !== undefined)
			body.position_ms = options.position_ms;

		await this.request(`/me/player/play${params}`, {
			method: "PUT",
			body: Object.keys(body).length > 0 ? JSON.stringify(body) : undefined,
		});
	}

	/**
	 * Play a specific track by URI
	 */
	async playTrack(trackUri: string, deviceId?: string): Promise<void> {
		await this.play({
			uris: [trackUri],
			device_id: deviceId,
		});
	}

	/**
	 * Play a context (album, artist, playlist) optionally starting at a specific track
	 */
	async playContext(
		contextUri: string,
		trackUri?: string,
		deviceId?: string,
	): Promise<void> {
		await this.play({
			context_uri: contextUri,
			offset: trackUri ? { uri: trackUri } : undefined,
			device_id: deviceId,
		});
	}

	/**
	 * Add a track to Spotify's playback queue
	 * The track will play after the current track and any previously queued tracks
	 */
	async addToQueue(trackUri: string, deviceId?: string): Promise<void> {
		const params = new URLSearchParams({ uri: trackUri });
		if (deviceId) params.append("device_id", deviceId);

		await this.request(`/me/player/queue?${params}`, {
			method: "POST",
		});
	}

	/**
	 * Pause playback
	 */
	async pause(deviceId?: string): Promise<void> {
		const params = deviceId ? `?device_id=${deviceId}` : "";
		await this.request(`/me/player/pause${params}`, { method: "PUT" });
	}

	/**
	 * Skip to next track
	 */
	async next(deviceId?: string): Promise<void> {
		const params = deviceId ? `?device_id=${deviceId}` : "";
		await this.request(`/me/player/next${params}`, { method: "POST" });
	}

	/**
	 * Skip to previous track
	 */
	async previous(deviceId?: string): Promise<void> {
		const params = deviceId ? `?device_id=${deviceId}` : "";
		await this.request(`/me/player/previous${params}`, { method: "POST" });
	}

	/**
	 * Transfer playback to a device
	 */
	async transferPlayback(
		deviceId: string,
		play: boolean = true,
	): Promise<void> {
		await this.request("/me/player", {
			method: "PUT",
			body: JSON.stringify({
				device_ids: [deviceId],
				play,
			}),
		});
	}

	/**
	 * Find spotifyd device from available devices
	 * Looks for common spotifyd device names
	 */
	async findSpotifydDevice(): Promise<{
		id: string;
		name: string;
		is_active: boolean;
	} | null> {
		try {
			const { devices } = await this.getDevices();

			// Common names for spotifyd devices
			const spotifydNames = ["spotify-tui", "spotifyd"];

			// First, look for device with known spotifyd names (case-insensitive)
			let spotifyd = devices.find((d) =>
				spotifydNames.some((name) => d.name.toLowerCase().includes(name)),
			);

			// If not found, could be custom name - look for Computer type
			// (spotifyd default device_type is "computer")
			if (!spotifyd) {
				spotifyd = devices.find((d) => d.type === "Computer" && !d.is_active);
			}

			return spotifyd || null;
		} catch {
			return null;
		}
	}

	/**
	 * Activate spotifyd as the playback device
	 * Returns true if successful, false otherwise
	 */
	async activateSpotifyd(startPlayback: boolean = false): Promise<{
		success: boolean;
		message: string;
		deviceName?: string;
	}> {
		try {
			const device = await this.findSpotifydDevice();

			if (!device) {
				return {
					success: false,
					message: "spotifyd device not found. Make sure spotifyd is running.",
				};
			}

			if (device.is_active) {
				return {
					success: true,
					message: `${device.name} is already active`,
					deviceName: device.name,
				};
			}

			await this.transferPlayback(device.id, startPlayback);

			return {
				success: true,
				message: `Activated ${device.name}`,
				deviceName: device.name,
			};
		} catch (error) {
			return {
				success: false,
				message:
					error instanceof Error ? error.message : "Failed to activate device",
			};
		}
	}

	// ─────────────────────────────────────────────────────────────
	// Library
	// ─────────────────────────────────────────────────────────────

	/**
	 * Get user's saved tracks with validation and caching
	 */
	async getSavedTracks(
		limit: number = API_LIMITS.SAVED_TRACKS,
		offset: number = 0,
	): Promise<SpotifyPaginatedResponse<SpotifySavedTrack>> {
		const cacheKey = CacheKeys.savedTracks(limit, offset);

		// Try cache first
		const cached =
			this.cache.get<SpotifyPaginatedResponse<SpotifySavedTrack>>(cacheKey);
		if (cached) {
			return cached;
		}

		// Fetch from API
		const params = new URLSearchParams({
			limit: limit.toString(),
			offset: offset.toString(),
		});

		const data = await this.request<unknown>(`/me/tracks?${params}`);
		const validated = safeValidate(
			PaginatedSavedTracksSchema,
			data,
			"getSavedTracks",
		);

		const result: SpotifyPaginatedResponse<SpotifySavedTrack> = validated
			? (validated as SpotifyPaginatedResponse<SpotifySavedTrack>)
			: {
					items: [],
					total: 0,
					limit,
					offset,
					href: "",
					next: null,
					previous: null,
				};

		// Cache for 5 minutes
		this.cache.set(cacheKey, result, CacheTTL.MEDIUM);

		return result;
	}

	/**
	 * Get user's playlists with validation and caching
	 */
	async getPlaylists(
		limit: number = API_LIMITS.PLAYLISTS,
		offset: number = 0,
	): Promise<SpotifyPaginatedResponse<SpotifyPlaylist>> {
		const cacheKey = CacheKeys.playlists(limit, offset);

		// Try cache first
		const cached =
			this.cache.get<SpotifyPaginatedResponse<SpotifyPlaylist>>(cacheKey);
		if (cached) {
			return cached;
		}

		// Fetch from API
		const params = new URLSearchParams({
			limit: limit.toString(),
			offset: offset.toString(),
		});

		const data = await this.request<unknown>(`/me/playlists?${params}`);
		const validated = safeValidate(
			PaginatedPlaylistsSchema,
			data,
			"getPlaylists",
		);

		const result: SpotifyPaginatedResponse<SpotifyPlaylist> = validated
			? (validated as SpotifyPaginatedResponse<SpotifyPlaylist>)
			: {
					items: [],
					total: 0,
					limit,
					offset,
					href: "",
					next: null,
					previous: null,
				};

		// Cache for 5 minutes
		this.cache.set(cacheKey, result, CacheTTL.MEDIUM);

		return result;
	}

	/**
	 * Get tracks in a playlist with validation and caching
	 */
	async getPlaylistTracks(
		playlistId: string,
		limit: number = API_LIMITS.PLAYLIST_TRACKS,
		offset: number = 0,
	): Promise<SpotifyPaginatedResponse<{ track: SpotifyTrack | null }>> {
		const cacheKey = CacheKeys.playlistTracks(playlistId, limit, offset);

		// Try cache first
		const cached =
			this.cache.get<SpotifyPaginatedResponse<{ track: SpotifyTrack | null }>>(
				cacheKey,
			);
		if (cached) {
			return cached;
		}

		// Fetch from API
		const params = new URLSearchParams({
			limit: limit.toString(),
			offset: offset.toString(),
		});

		const data = await this.request<unknown>(
			`/playlists/${playlistId}/tracks?${params}`,
		);
		const validated = safeValidate(
			PaginatedPlaylistTracksSchema,
			data,
			"getPlaylistTracks",
		);

		const result: SpotifyPaginatedResponse<{ track: SpotifyTrack | null }> =
			validated
				? (validated as SpotifyPaginatedResponse<{
						track: SpotifyTrack | null;
					}>)
				: {
						items: [],
						total: 0,
						limit,
						offset,
						href: "",
						next: null,
						previous: null,
					};

		// Cache for 5 minutes
		this.cache.set(cacheKey, result, CacheTTL.MEDIUM);

		return result;
	}

	// ─────────────────────────────────────────────────────────────
	// Cache Management
	// ─────────────────────────────────────────────────────────────

	/**
	 * Invalidate saved tracks cache (call when user likes/unlikes a song)
	 */
	invalidateSavedTracksCache(): void {
		this.cache.invalidatePattern("saved-tracks:");
	}

	/**
	 * Invalidate playlists cache (call when playlists are added/removed)
	 */
	invalidatePlaylistsCache(): void {
		this.cache.invalidatePattern("playlists:");
	}

	/**
	 * Invalidate specific playlist tracks cache
	 */
	invalidatePlaylistTracksCache(playlistId: string): void {
		this.cache.invalidatePattern(`playlist-tracks:${playlistId}:`);
	}

	/**
	 * Clear all caches
	 */
	clearAllCaches(): void {
		this.cache.clear();
	}

	/**
	 * Get cache statistics for debugging
	 */
	getCacheStats() {
		return this.cache.getStats();
	}

	/**
	 * Get an album's tracks
	 */
	async getAlbumTracks(
		albumId: string,
		limit: number = API_LIMITS.ALBUM_TRACKS,
		offset: number = 0,
	): Promise<SpotifyPaginatedResponse<SpotifyTrack>> {
		const params = new URLSearchParams({
			limit: limit.toString(),
			offset: offset.toString(),
		});
		return this.request(`/albums/${albumId}/tracks?${params}`);
	}

	/**
	 * Get an artist's top tracks
	 */
	async getArtistTopTracks(
		artistId: string,
		market: string = DEFAULT_MARKET,
	): Promise<{ tracks: SpotifyTrack[] }> {
		return this.request(`/artists/${artistId}/top-tracks?market=${market}`);
	}

	// ─────────────────────────────────────────────────────────────
	// User
	// ─────────────────────────────────────────────────────────────

	/**
	 * Get current user's profile
	 */
	async getCurrentUser(): Promise<{ display_name: string; id: string }> {
		return this.request<{ display_name: string; id: string }>("/me");
	}
}

// Singleton instance
let spotifyApiInstance: SpotifyApiService | null = null;

export function getSpotifyApiService(): SpotifyApiService {
	if (!spotifyApiInstance) {
		spotifyApiInstance = new SpotifyApiService();
	}
	return spotifyApiInstance;
}
