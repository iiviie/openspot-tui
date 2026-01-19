/**
 * Authentication Controller Interface
 * Handles Spotify Web API and spotifyd authentication
 */

export interface IAuthenticationController {
	/**
	 * Login to Spotify Web API
	 */
	loginToSpotify(): Promise<void>;

	/**
	 * Logout from Spotify
	 */
	logoutFromSpotify(): Promise<void>;

	/**
	 * Authenticate spotifyd via OAuth
	 */
	authenticateSpotifyd(): Promise<void>;

	/**
	 * Check auth status and show prompts if needed
	 */
	checkAuthStatusAndPrompt(): void;

	/**
	 * Fetch and cache user profile
	 */
	fetchAndCacheUserProfile(): Promise<void>;
}
