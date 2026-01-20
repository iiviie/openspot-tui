/**
 * Native MPRIS Adapter Service
 *
 * This service wraps the Rust native module and provides the same interface
 * as the TypeScript MprisService, allowing for a drop-in replacement.
 */

import { getAppEventBus } from "../events";
import { getLogger } from "../utils";
import type {
	LoopStatus,
	MprisMetadata,
	MprisPlayerState,
	NowPlayingInfo,
	PlaybackStatus,
} from "../types/mpris";

const logger = getLogger("NativeMprisAdapter");
const eventBus = getAppEventBus();

// Type definitions from native module
interface NativePlaybackState {
	isPlaying: boolean;
	positionMs: number;
	durationMs: number;
	volume: number;
	shuffle: boolean;
	repeat: "None" | "Playlist" | "Track";
	track?: {
		title: string;
		artist: string;
		album: string;
		artUrl?: string;
		uri: string;
	};
}

interface NativeSpotifydStatus {
	running: boolean;
	pid?: number;
	authenticated: boolean;
}

/**
 * Native MPRIS Adapter - provides MprisService-compatible interface
 * backed by the Rust native module for better performance
 */
export class NativeMprisAdapter {
	private mpris: any = null;
	private spotifyd: any = null;
	private connected: boolean = false;
	private isInitialized: boolean = false;
	private lastState: NativePlaybackState | null = null;

	/**
	 * Initialize the native module
	 */
	async initialize(): Promise<boolean> {
		if (this.isInitialized) return true;

		try {
			// Dynamically import the native module
			// @ts-ignore - Native module will be available after build
			const native = await import("../../mpris-native/index.js");

			// Initialize MPRIS controller
			this.mpris = new native.MprisController();

			// Initialize spotifyd supervisor
			this.spotifyd = new native.SpotifydSupervisor();

			// Set up state change listener
			this.mpris.onStateChange((state: NativePlaybackState) => {
				this.lastState = state;
				this.emitStateChanges(state);
			});

			this.isInitialized = true;
			logger.info("Native MPRIS adapter initialized");
			return true;
		} catch (error) {
			logger.error("Failed to initialize native MPRIS adapter:", error);
			return false;
		}
	}

	/**
	 * Emit event bus events based on state changes
	 */
	private emitStateChanges(state: NativePlaybackState): void {
		// Emit playback state changed
		eventBus.emitSync("playback:stateChanged", {
			isPlaying: state.isPlaying,
			position: Math.floor(state.positionMs),
			duration: Math.floor(state.durationMs),
			volume: state.volume,
			shuffle: state.shuffle,
			loopStatus: state.repeat,
		});

		// Emit track changed if track info is available
		if (state.track) {
			eventBus.emitSync("playback:trackChanged", {
				title: state.track.title,
				artist: state.track.artist,
				album: state.track.album,
				artUrl: state.track.artUrl || "",
				uri: state.track.uri,
				duration: Math.floor(state.durationMs),
			});
		}
	}

	// ─────────────────────────────────────────────────────────────
	// Connection Management (MprisService-compatible interface)
	// ─────────────────────────────────────────────────────────────

	/**
	 * Connect to the spotifyd MPRIS interface
	 */
	async connect(): Promise<boolean> {
		if (!this.isInitialized) {
			const initialized = await this.initialize();
			if (!initialized) return false;
		}

		try {
			await this.mpris.connect();
			this.connected = true;
			logger.info("Connected to MPRIS via native module");
			return true;
		} catch (error) {
			logger.error("Failed to connect to MPRIS:", error);
			this.connected = false;
			return false;
		}
	}

	/**
	 * Disconnect from MPRIS
	 */
	async disconnect(): Promise<void> {
		this.connected = false;
		// Native module handles cleanup automatically
	}

	/**
	 * Check if connected to MPRIS
	 */
	isConnected(): boolean {
		return this.connected;
	}

	/**
	 * Ensure connection is active, reconnect if needed
	 */
	async ensureConnection(): Promise<boolean> {
		if (this.connected) return true;
		return await this.connect();
	}

	/**
	 * Verify connection is still valid
	 */
	async verifyConnection(): Promise<boolean> {
		if (!this.connected || !this.mpris) return false;
		try {
			// Try to get state - if it works, connection is valid
			this.mpris.getState();
			return true;
		} catch {
			this.connected = false;
			return false;
		}
	}

	// ─────────────────────────────────────────────────────────────
	// Playback Controls
	// ─────────────────────────────────────────────────────────────

	async play(): Promise<void> {
		const state = this.mpris?.getState();
		if (state && !state.isPlaying) {
			await this.playPause();
		}
	}

	async pause(): Promise<void> {
		const state = this.mpris?.getState();
		if (state && state.isPlaying) {
			await this.playPause();
		}
	}

	async playPause(): Promise<void> {
		if (!this.mpris) return;
		await this.mpris.playPause();
	}

	async next(): Promise<void> {
		if (!this.mpris) return;
		await this.mpris.next();
	}

	async previous(): Promise<void> {
		if (!this.mpris) return;
		await this.mpris.previous();
	}

	async stop(): Promise<void> {
		await this.pause();
	}

	async seek(offsetMicroseconds: number): Promise<void> {
		if (!this.mpris) return;
		// Convert microseconds to milliseconds
		await this.mpris.seek(Math.floor(offsetMicroseconds / 1000));
	}

	async setPosition(
		_trackId: string,
		positionMicroseconds: number,
	): Promise<void> {
		// Native module doesn't support absolute position set yet
		// Use seek as a workaround
		const currentPosition = this.lastState?.positionMs || 0;
		const targetPositionMs = Math.floor(positionMicroseconds / 1000);
		const offsetMs = targetPositionMs - currentPosition;
		if (offsetMs !== 0) {
			await this.mpris?.seek(offsetMs);
		}
	}

	// ─────────────────────────────────────────────────────────────
	// Properties
	// ─────────────────────────────────────────────────────────────

	async getPlaybackStatus(): Promise<PlaybackStatus> {
		const state = this.mpris?.getState();
		if (!state) return "Stopped";
		return state.isPlaying ? "Playing" : "Paused";
	}

	async getMetadata(): Promise<MprisMetadata | null> {
		const state = this.mpris?.getState();
		if (!state?.track) return null;

		return {
			trackId: state.track.uri,
			title: state.track.title,
			artist: [state.track.artist],
			album: state.track.album,
			albumArtist: [],
			artUrl: state.track.artUrl || "",
			length: state.durationMs * 1000, // Convert to microseconds
			url: state.track.uri,
		};
	}

	async getPosition(): Promise<number> {
		const state = this.mpris?.getState();
		return (state?.positionMs || 0) * 1000; // Return in microseconds
	}

	async getVolume(): Promise<number> {
		const state = this.mpris?.getState();
		return state?.volume ?? 1.0;
	}

	async setVolume(volume: number): Promise<void> {
		if (!this.mpris) return;
		const clamped = Math.max(0, Math.min(1, volume));
		await this.mpris.setVolume(clamped);
	}

	async getShuffle(): Promise<boolean> {
		const state = this.mpris?.getState();
		return state?.shuffle ?? false;
	}

	async setShuffle(shuffle: boolean): Promise<void> {
		if (!this.mpris) return;
		await this.mpris.setShuffle(shuffle);
	}

	async getLoopStatus(): Promise<LoopStatus> {
		const state = this.mpris?.getState();
		return (state?.repeat as LoopStatus) || "None";
	}

	async setLoopStatus(status: LoopStatus): Promise<void> {
		if (!this.mpris) return;
		await this.mpris.setRepeat(status);
	}

	// ─────────────────────────────────────────────────────────────
	// Convenience Methods
	// ─────────────────────────────────────────────────────────────

	async getPlayerState(): Promise<MprisPlayerState | null> {
		if (!this.connected || !this.mpris) return null;

		const state = this.mpris.getState();
		if (!state) return null;

		const metadata = await this.getMetadata();

		return {
			playbackStatus: state.isPlaying ? "Playing" : "Paused",
			metadata,
			position: state.positionMs * 1000, // microseconds
			volume: state.volume,
			canGoNext: true,
			canGoPrevious: true,
			canPlay: true,
			canPause: true,
			canSeek: true,
			shuffle: state.shuffle,
			loopStatus: state.repeat as LoopStatus,
		};
	}

	async getNowPlaying(): Promise<NowPlayingInfo | null> {
		const connected = await this.ensureConnection();
		if (!connected) return null;

		try {
			// Refresh state from D-Bus to get latest position/track info
			await this.mpris?.refreshState();

			const state = this.mpris?.getState();
			if (!state?.track) return null;

			return {
				title: state.track.title,
				artist: state.track.artist,
				album: state.track.album,
				artUrl: state.track.artUrl || "",
				durationMs: state.durationMs,
				positionMs: state.positionMs,
				isPlaying: state.isPlaying,
				volume: state.volume,
				shuffle: state.shuffle,
				loopStatus: state.repeat as LoopStatus,
			};
		} catch {
			this.connected = false;
			return null;
		}
	}

	async volumeUp(amount: number = 0.05): Promise<void> {
		if (!this.mpris) return;
		try {
			const current = await this.getVolume();
			await this.setVolume(current + amount);
		} catch {
			// Volume control can fail - silently ignore
		}
	}

	async volumeDown(amount: number = 0.05): Promise<void> {
		if (!this.mpris) return;
		try {
			const current = await this.getVolume();
			await this.setVolume(current - amount);
		} catch {
			// Volume control can fail - silently ignore
		}
	}

	async toggleShuffle(currentState?: boolean): Promise<boolean> {
		const current = currentState ?? (await this.getShuffle());
		const newState = !current;
		await this.setShuffle(newState);
		return newState;
	}

	async cycleLoopStatus(currentStatus?: LoopStatus): Promise<LoopStatus> {
		const current = currentStatus ?? (await this.getLoopStatus());
		const next: LoopStatus =
			current === "None"
				? "Playlist"
				: current === "Playlist"
					? "Track"
					: "None";
		await this.setLoopStatus(next);
		return next;
	}

	async seekForward(ms: number = 10000): Promise<void> {
		if (!this.mpris) return;
		try {
			await this.seek(ms * 1000); // Convert to microseconds
		} catch {
			// Seek can fail if no track is playing - silently ignore
		}
	}

	async seekBackward(ms: number = 10000): Promise<void> {
		if (!this.mpris) return;
		try {
			await this.seek(-ms * 1000); // Convert to microseconds
		} catch {
			// Seek can fail if no track is playing - silently ignore
		}
	}

	// ─────────────────────────────────────────────────────────────
	// Spotifyd Management
	// ─────────────────────────────────────────────────────────────

	async startSpotifyd(): Promise<void> {
		if (!this.isInitialized) {
			await this.initialize();
		}
		await this.spotifyd?.start();
	}

	async stopSpotifyd(): Promise<void> {
		await this.spotifyd?.stop();
	}

	getSpotifydStatus(): NativeSpotifydStatus | null {
		return this.spotifyd?.getStatus() || null;
	}
}

// Singleton instance
let instance: NativeMprisAdapter | null = null;

export function getNativeMprisAdapter(): NativeMprisAdapter {
	if (!instance) {
		instance = new NativeMprisAdapter();
	}
	return instance;
}

// For backwards compatibility, also export as getMprisService
export { getNativeMprisAdapter as getMprisService };
