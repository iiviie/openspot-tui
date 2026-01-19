import type { IConnectionManager } from "../interfaces";
import type { IMprisService } from "../types/mpris";
import type { SpotifyApiService, SpotifydService } from "../services";
import type { ConnectionStatus, StatusSidebar } from "../components";
import type { ContentWindow } from "../components/ContentWindow";
import type { ToastManager } from "../components/ToastManager";
import { getConfigService } from "../services/ConfigService";
import { getLogger } from "../utils";

const logger = getLogger("ConnectionManager");

/**
 * Connection Manager
 * Manages spotifyd activation and MPRIS connection/reconnection
 */
export class ConnectionManager implements IConnectionManager {
	// Granular connection state tracking
	private spotifydState: import("../components").SpotifydState = "stopped";
	private mprisState: import("../components").MprisState = "disconnected";

	constructor(
		private mpris: IMprisService,
		private spotifyApi: SpotifyApiService,
		private spotifydService: SpotifydService,
		private statusSidebar: StatusSidebar,
		private contentWindow: ContentWindow,
		private toastManager: ToastManager | null,
		private onRender: () => void,
	) {}

	/**
	 * Initialize and start spotifyd if needed
	 */
	async initializeSpotifyd(): Promise<void> {
		const result = await this.spotifydService.start();

		if (!result.success) {
			// Warn but don't exit - user can authenticate later via Ctrl+P
			logger.warn("spotifyd not running");
			logger.always("   Press Ctrl+P → 'Authenticate Spotifyd' to set up\n");
			// Don't exit - allow app to run without spotifyd
		}
		// Note: Removed 1s wait - MPRIS connection has retry + TransferPlayback logic
	}

	/**
	 * Initialize MPRIS connection to spotifyd
	 * Connection happens in background to avoid blocking TUI startup
	 */
	async initializeMpris(): Promise<void> {
		// Connect in background without blocking TUI startup
		this.mpris
			.connect()
			.then((connected) => {
				if (!connected) {
					logger.warn("Could not connect to spotifyd. Make sure it's running.");
					logger.always("Run: spotifyd --no-daemon");
				} else {
					logger.info("MPRIS connection established");
				}
			})
			.catch((error) => {
				logger.error("MPRIS connection error:", error);
			});
	}

	/**
	 * Activate spotifyd as the Spotify Connect playback device
	 * This allows playback without needing the Spotify app open
	 * Retries a few times since spotifyd needs time to register with Spotify
	 */
	async activateSpotifydDevice(): Promise<void> {
		const maxRetries = 5;
		const retryDelayMs = 2000; // 2 seconds between retries

		for (let attempt = 1; attempt <= maxRetries; attempt++) {
			const result = await this.spotifyApi.activateSpotifyd(false);

			if (result.success) {
				this.updateConnectionStatus();
				return;
			}

			// If device not found and we have retries left, wait and try again
			if (attempt < maxRetries) {
				await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
			}
		}

		// All retries exhausted - silently fail, user can manually activate via Ctrl+P
		this.updateConnectionStatus();
	}

	/**
	 * Reconnect to MPRIS with retry logic and exponential backoff
	 * @param maxAttempts - Maximum number of connection attempts
	 * @returns true if connected, false if all retries failed
	 */
	async reconnectMprisWithRetry(maxAttempts = 5): Promise<boolean> {
		const delays = [500, 1000, 2000, 3000, 4000]; // Exponential backoff delays

		for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			this.mprisState = attempt === 1 ? "connecting" : "reconnecting";
			this.updateConnectionStatus();
			this.contentWindow.setStatus(
				`Connecting to MPRIS (attempt ${attempt}/${maxAttempts})...`,
			);

			const connected = await this.mpris.connect();
			if (connected) {
				this.mprisState = "connected";
				this.updateConnectionStatus();
				this.contentWindow.setStatus("MPRIS connected!");
				return true;
			}

			// Wait before retrying (except on last attempt)
			if (attempt < maxAttempts) {
				const delay = delays[attempt - 1] || 3000;
				await new Promise((resolve) => setTimeout(resolve, delay));
			}
		}

		// All retries exhausted
		this.mprisState = "disconnected";
		this.updateConnectionStatus();
		this.contentWindow.setStatus("MPRIS connection failed after all retries");
		return false;
	}

	/**
	 * Update connection status in the status sidebar
	 */
	updateConnectionStatus(): void {
		const spotifydStatus = this.spotifydService.getStatus();

		// Determine which backend is being used
		const useNative = process.env.SPOTIFY_TUI_USE_NATIVE !== "0";

		// Determine spotifyd granular state (unless manually set during operations)
		if (
			this.spotifydState !== "starting" &&
			this.spotifydState !== "stopping" &&
			this.spotifydState !== "authenticating"
		) {
			if (!spotifydStatus.installed) {
				this.spotifydState = "not_installed";
			} else if (!spotifydStatus.authenticated) {
				this.spotifydState = "not_authenticated";
			} else if (spotifydStatus.running) {
				this.spotifydState = "running";
			} else {
				this.spotifydState = "stopped";
			}
		}

		// Determine MPRIS granular state (unless manually set during operations)
		if (
			this.mprisState !== "connecting" &&
			this.mprisState !== "reconnecting"
		) {
			if (this.mpris?.isConnected()) {
				this.mprisState = "connected";
			} else {
				this.mprisState = "disconnected";
			}
		}

		// Check if Web API is authenticated
		const configService = getConfigService();
		const webApiLoggedIn = configService.hasCredentials();

		const connectionStatus: ConnectionStatus = {
			spotifydInstalled: spotifydStatus.installed,
			spotifydRunning: spotifydStatus.running,
			spotifydAuthenticated: spotifydStatus.authenticated,
			spotifydState: this.spotifydState,
			mprisConnected: this.mpris?.isConnected() ?? false,
			mprisState: this.mprisState,
			mprisBackend: useNative ? "native" : "typescript",
			webApiLoggedIn,
		};

		this.statusSidebar.updateConnectionStatus(connectionStatus);
	}

	/**
	 * Set spotifyd state manually (for operations like authenticating)
	 */
	setSpotifydState(state: import("../components").SpotifydState): void {
		this.spotifydState = state;
		this.updateConnectionStatus();
	}

	/**
	 * Set MPRIS state manually (for operations like connecting)
	 */
	setMprisState(state: import("../components").MprisState): void {
		this.mprisState = state;
		this.updateConnectionStatus();
	}
}
