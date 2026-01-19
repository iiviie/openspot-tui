import type { IAuthenticationController } from "../interfaces";
import type { SpotifydService } from "../services";
import type { ConnectionManager } from "./ConnectionManager";
import type { NavigationController } from "./NavigationController";
import type { ContentWindow } from "../components/ContentWindow";
import type { ToastManager } from "../components/ToastManager";
import type { Sidebar } from "../components/Sidebar";
import { getConfigService } from "../services/ConfigService";
import {
	getPersistentCache,
	PersistentCacheKeys,
} from "../services/PersistentCacheService";
import { getLogger } from "../utils";

const logger = getLogger("AuthenticationController");

/**
 * Authentication Controller
 * Handles Spotify Web API and spotifyd authentication
 */
export class AuthenticationController implements IAuthenticationController {
	constructor(
		private spotifydService: SpotifydService,
		private connectionManager: ConnectionManager,
		private navigationController: NavigationController,
		private contentWindow: ContentWindow,
		private sidebar: Sidebar,
		private toastManager: ToastManager | null,
		private onRender: () => void,
	) {}

	/**
	 * Login to Spotify Web API
	 */
	async loginToSpotify(): Promise<void> {
		try {
			const authService = await import("../services/AuthService").then((m) =>
				m.getAuthService(),
			);

			await authService.login();

			this.toastManager?.success("Logged In", "Loading library...", 2000);
			this.onRender();

			// Reload library data and fetch user profile in parallel (independent operations)
			await Promise.all([
				this.navigationController.loadSavedTracks(),
				this.fetchAndCacheUserProfile(),
			]);

			// Update connection status to show logged in
			this.connectionManager.updateConnectionStatus();
		} catch (error) {
			const message = error instanceof Error ? error.message : "Login failed";
			this.toastManager?.error("Login Failed", message, 4000);
			this.onRender();
			logger.error("Login failed:", error);
		}
	}

	/**
	 * Logout from Spotify
	 * Clears credentials and all caches
	 */
	async logoutFromSpotify(): Promise<void> {
		try {
			const configService = getConfigService();
			const persistentCache = getPersistentCache();

			// Clear credentials
			configService.clearCredentials();

			// Clear all caches
			const cacheService = await import("../services/CacheService").then((m) =>
				m.getCacheService(),
			);
			cacheService.clear();
			persistentCache.clearAll();

			// Clear UI state
			this.contentWindow.updateTracks([], "");
			// Clear view stack (will be handled by navigation controller)

			// Update sidebar to show "Not logged in"
			this.sidebar.updateUsername(null);

			// Show success toast
			this.toastManager?.success("Logged Out", "Credentials cleared", 2000);
			this.onRender();

			// Update connection status
			this.connectionManager.updateConnectionStatus();

			logger.info("Logged out successfully");
		} catch (error) {
			const message = error instanceof Error ? error.message : "Logout failed";
			this.toastManager?.error("Logout Error", message, 4000);
			this.onRender();
			logger.error("Logout failed:", error);
		}
	}

	/**
	 * Authenticate spotifyd via OAuth
	 */
	async authenticateSpotifyd(): Promise<void> {
		// Force re-render to show status updates
		this.onRender();

		// Set authenticating state
		this.connectionManager.setSpotifydState("authenticating");

		// Check if spotifyd is running - we need to stop it to avoid port conflicts during auth
		const wasRunning = await this.spotifydService.isRunning();
		if (wasRunning) {
			this.connectionManager.setSpotifydState("stopping");
			await this.spotifydService.stop(true); // Force stop any running instance
			// Wait for it to fully stop
			await new Promise((resolve) => setTimeout(resolve, 500));
		}

		this.connectionManager.setSpotifydState("authenticating");
		this.onRender();

		const result = await this.spotifydService.authenticate();

		if (result.success) {
			this.toastManager?.success("Spotifyd Auth", "Starting spotifyd...", 2000);
			this.connectionManager.setSpotifydState("starting");
			this.onRender();

			// Restart spotifyd with new credentials
			const startResult = await this.spotifydService.start();
			if (startResult.success) {
				this.connectionManager.setSpotifydState("running");
				this.connectionManager.setMprisState("connecting");

				// Reconnect MPRIS with retry logic
				const connected =
					await this.connectionManager.reconnectMprisWithRetry(5);
				if (connected) {
					this.connectionManager.setMprisState("connected");
					this.toastManager?.success("Connected", "Spotifyd ready", 2000);
				} else {
					this.connectionManager.setMprisState("disconnected");
					this.toastManager?.warning(
						"MPRIS Failed",
						"Try manual connection",
						4000,
					);
				}
				this.connectionManager.updateConnectionStatus();
				this.onRender();
			} else {
				this.connectionManager.setSpotifydState("stopped");
				this.toastManager?.error("Restart Failed", startResult.message, 4000);
				this.onRender();
			}
		} else {
			this.connectionManager.setSpotifydState(
				wasRunning ? "stopped" : "not_authenticated",
			);
			this.toastManager?.error("Auth Failed", result.message, 4000);
			this.onRender();
			// Try to restart spotifyd if we stopped it
			if (wasRunning) {
				this.connectionManager.setSpotifydState("starting");
				await this.spotifydService.start();
				this.connectionManager.setSpotifydState("running");
			}
		}
	}

	/**
	 * Check auth status and show prompts if needed
	 */
	checkAuthStatusAndPrompt(): void {
		const configService = getConfigService();
		const spotifydStatus = this.spotifydService.getStatus();

		const webApiLoggedIn = configService.hasCredentials();
		const spotifydAuth = spotifydStatus.authenticated;

		// If neither is authenticated, prompt for spotifyd first
		if (!webApiLoggedIn && !spotifydAuth) {
			setTimeout(() => {
				this.toastManager?.info(
					"Setup Required",
					"Press Ctrl+P to authenticate",
					6000,
				);
				this.onRender();
			}, 2000);
		}
		// If spotifyd is auth'd but Web API isn't
		else if (!webApiLoggedIn && spotifydAuth) {
			setTimeout(() => {
				this.toastManager?.info(
					"Login Required",
					"Press Ctrl+P to login to Spotify",
					6000,
				);
				this.onRender();
			}, 2000);
		}
		// If Web API is auth'd but spotifyd isn't
		else if (webApiLoggedIn && !spotifydAuth) {
			setTimeout(() => {
				this.toastManager?.info(
					"Spotifyd Setup",
					"Press Ctrl+P to authenticate spotifyd",
					6000,
				);
				this.onRender();
			}, 2000);
		}
	}

	/**
	 * Fetch and cache user profile
	 * Called on startup if credentials exist
	 */
	async fetchAndCacheUserProfile(): Promise<void> {
		const configService = getConfigService();

		// Only fetch if we have credentials
		if (!configService.hasCredentials()) {
			return;
		}

		try {
			// Import SpotifyApiService dynamically to avoid circular dependency
			const { getSpotifyApiService } = await import("../services");
			const spotifyApi = getSpotifyApiService();

			const profile = await spotifyApi.getCurrentUser();
			const displayName = profile.display_name || profile.id;

			// Cache the display name
			const persistentCache = getPersistentCache();
			persistentCache.set(
				PersistentCacheKeys.USER_PROFILE_DISPLAY_NAME,
				displayName,
			);

			// Update sidebar
			this.sidebar.updateUsername(displayName);
		} catch (error) {
			// Don't crash app if profile fetch fails
			// User can still use the app, just won't see their name
			logger.warn("Failed to fetch user profile:", error);
		}
	}
}
