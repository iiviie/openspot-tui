import type { MenuItem } from "../types";
import type { SpotifyTrack } from "../types/spotify";

/**
 * Navigation Controller Interface
 * Handles navigation between views (playlists, tracks, search)
 */

export interface INavigationController {
	/**
	 * Load user's playlists
	 */
	loadPlaylists(): Promise<void>;

	/**
	 * Load user's saved tracks
	 */
	loadSavedTracks(): Promise<void>;

	/**
	 * Load tracks from a specific playlist
	 */
	loadPlaylistTracks(playlistId: string, playlistName: string): Promise<void>;

	/**
	 * Handle library menu selection (playlists, songs, albums, artists)
	 */
	handleLibrarySelect(item: MenuItem): Promise<void>;

	/**
	 * Search for tracks
	 */
	search(query: string): Promise<void>;

	/**
	 * Navigate back in view stack
	 */
	goBack(): Promise<void>;

	/**
	 * Get current view stack
	 */
	getViewStack(): string[];
}
