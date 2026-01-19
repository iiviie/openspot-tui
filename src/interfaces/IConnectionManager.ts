/**
 * Connection Manager Interface
 * Manages spotifyd activation and MPRIS connection/reconnection
 */

export interface IConnectionManager {
	/**
	 * Activate spotifyd as the Spotify Connect playback device
	 */
	activateSpotifydDevice(): Promise<void>;

	/**
	 * Reconnect to MPRIS with retry logic
	 * @param maxAttempts - Maximum number of connection attempts
	 * @returns true if connected, false if all retries failed
	 */
	reconnectMprisWithRetry(maxAttempts?: number): Promise<boolean>;

	/**
	 * Update connection status in UI
	 */
	updateConnectionStatus(): void;

	/**
	 * Initialize and start spotifyd
	 */
	initializeSpotifyd(): Promise<void>;

	/**
	 * Initialize MPRIS connection
	 */
	initializeMpris(): Promise<void>;
}
