import type { INavigationController } from "../interfaces";
import type { MenuItem } from "../types";
import type { SpotifyApiService } from "../services";
import type { ContentWindow } from "../components/ContentWindow";
import type { SpotifyTrack } from "../types/spotify";
import { getConfigService } from "../services/ConfigService";
import {
	getPersistentCache,
	PersistentCacheKeys,
} from "../services/PersistentCacheService";
import { getLogger } from "../utils";

const logger = getLogger("NavigationController");

/**
 * Navigation Controller
 * Handles navigation between views (playlists, tracks, search)
 */
export class NavigationController implements INavigationController {
	private viewStack: string[] = ["songs"];

	constructor(
		private spotifyApi: SpotifyApiService,
		private contentWindow: ContentWindow,
		private onFocusContent: () => void,
	) {}

	/**
	 * Load user's playlists
	 */
	async loadPlaylists(): Promise<void> {
		this.contentWindow.setLoading(true, "Loading playlists...");

		try {
			const response = await this.spotifyApi.getPlaylists(50);
			this.contentWindow.updatePlaylists(response.items);
			this.viewStack = ["playlists"];
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to load playlists";
			this.contentWindow.setStatus(`Error: ${message}`);
		}
	}

	/**
	 * Load user's saved tracks
	 */
	async loadSavedTracks(): Promise<void> {
		const configService = getConfigService();
		const persistentCache = getPersistentCache();
		const cacheKey = PersistentCacheKeys.savedTracks();

		// Check if we have valid credentials before loading cache
		if (!configService.hasCredentials()) {
			logger.info("No credentials found - skipping saved tracks load");
			this.contentWindow.setStatus(
				"Not logged in - Press Ctrl+P → 'Login to Spotify'",
			);

			// Clear any stale cache
			persistentCache.clearAll();
			return;
		}

		// Try to load from disk cache first (instant startup!)
		const cachedTracks = persistentCache.get<SpotifyTrack[]>(cacheKey);
		if (cachedTracks && cachedTracks.length > 0) {
			const age = persistentCache.getAge(cacheKey);
			const ageMinutes = age ? Math.floor(age / 60000) : 0;

			// Show cached data immediately
			this.contentWindow.updateTracks(cachedTracks, "Liked Songs");
			this.viewStack = ["songs"];

			logger.info(
				`Loaded ${cachedTracks.length} tracks from cache (${ageMinutes}m old)`,
			);

			// Refresh in background if cache is older than 5 minutes
			if (!age || age > 5 * 60 * 1000) {
				this.refreshSavedTracksInBackground();
			}
			return;
		}

		// No cache - show loading and fetch
		this.contentWindow.setLoading(true, "Loading saved tracks...");

		try {
			const response = await this.spotifyApi.getSavedTracks(50);
			const tracks = response.items.map((item) => item.track);

			// Update UI
			this.contentWindow.updateTracks(tracks, "Liked Songs");
			this.viewStack = ["songs"];

			// Save to persistent cache for next startup
			persistentCache.set(cacheKey, tracks);

			logger.info(`Loaded ${tracks.length} tracks from API`);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to load tracks";
			this.contentWindow.setStatus(`Error: ${message}`);
		}
	}

	/**
	 * Refresh saved tracks in background (stale-while-revalidate)
	 */
	private async refreshSavedTracksInBackground(): Promise<void> {
		try {
			const response = await this.spotifyApi.getSavedTracks(50);
			const tracks = response.items.map((item) => item.track);

			// Update UI quietly (no loading indicator)
			this.contentWindow.updateTracks(tracks, "Liked Songs");

			// Update persistent cache
			getPersistentCache().set(PersistentCacheKeys.savedTracks(), tracks);

			logger.debug("Refreshed saved tracks in background");
		} catch (error) {
			// Silent failure - user already sees cached data
			logger.warn("Background refresh failed:", error);
		}
	}

	/**
	 * Load tracks from a specific playlist
	 */
	async loadPlaylistTracks(
		playlistId: string,
		playlistName: string,
	): Promise<void> {
		this.contentWindow.setLoading(true, `Loading ${playlistName}...`);

		try {
			const response = await this.spotifyApi.getPlaylistTracks(playlistId, 100);
			const tracks = response.items
				.filter((item): item is { track: SpotifyTrack } => item.track !== null)
				.map((item) => item.track);

			this.contentWindow.updatePlaylistTracks(tracks, playlistName);
			this.viewStack.push(`playlist:${playlistId}`);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to load playlist";
			this.contentWindow.setStatus(`Error: ${message}`);
		}
	}

	/**
	 * Handle library menu selection (playlists, songs, albums, artists)
	 */
	async handleLibrarySelect(item: MenuItem): Promise<void> {
		switch (item.id) {
			case "playlists":
				await this.loadPlaylists();
				break;
			case "songs":
				await this.loadSavedTracks();
				break;
			case "albums":
				// TODO: Implement albums
				this.contentWindow.setStatus("Albums - Coming soon");
				break;
			case "artists":
				// TODO: Implement artists
				this.contentWindow.setStatus("Artists - Coming soon");
				break;
		}

		// Move focus to content after selecting from library
		this.onFocusContent();
	}

	/**
	 * Search for tracks
	 */
	async search(query: string): Promise<void> {
		this.contentWindow.setLoading(true, "Searching...");
		this.onFocusContent();

		try {
			const tracks = await this.spotifyApi.searchTracks(query, 20);
			this.contentWindow.updateSearchResults(tracks);
			this.viewStack.push(`search:${query}`);
		} catch (error) {
			const message = error instanceof Error ? error.message : "Search failed";
			this.contentWindow.setStatus(`Error: ${message}`);
		}
	}

	/**
	 * Navigate back in view stack
	 */
	async goBack(): Promise<void> {
		if (this.viewStack.length <= 1) {
			// Already at root, just reload songs
			await this.loadSavedTracks();
			return;
		}

		this.viewStack.pop();
		const previousView = this.viewStack[this.viewStack.length - 1];

		if (previousView === "songs") {
			await this.loadSavedTracks();
		} else if (previousView === "playlists") {
			await this.loadPlaylists();
		} else if (previousView.startsWith("playlist:")) {
			// Go back to playlists list instead of previous playlist
			await this.loadPlaylists();
			this.viewStack = ["playlists"];
		}
	}

	/**
	 * Get current view stack
	 */
	getViewStack(): string[] {
		return [...this.viewStack];
	}
}
