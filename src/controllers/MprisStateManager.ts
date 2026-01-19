import type { IMprisStateManager } from "../interfaces";
import type { IMprisService, NowPlayingInfo } from "../types/mpris";
import type { CurrentTrack } from "../types";
import type { StatusSidebar } from "../components";
import type { SpotifyApiService } from "../services";
import type { StateManager } from "../state";
import { TRACK_END_THRESHOLD_MS } from "../config";
import { getLogger } from "../utils";

const logger = getLogger("MprisStateManager");

/**
 * MPRIS State Manager
 * Polls MPRIS and updates application state
 */
export class MprisStateManager implements IMprisStateManager {
	// Track change detection for syncing visual queue and queue playback
	private previousTrackTitle: string | null = null;
	private trackEndHandled: boolean = false;

	// Cooldown tracking for optimistic UI updates (prevents flickering)
	private readonly OPTIMISTIC_COOLDOWN_MS = 1500; // 1.5 seconds cooldown
	private playStateCooldownUntil: number = 0;
	private shuffleCooldownUntil: number = 0;
	private repeatCooldownUntil: number = 0;

	constructor(
		private mpris: IMprisService,
		private stateManager: StateManager,
		private statusSidebar: StatusSidebar | null,
		private spotifyApi: SpotifyApiService,
	) {}

	/**
	 * Set cooldown for play state (prevents flickering during optimistic updates)
	 */
	setPlayStateCooldown(): void {
		this.playStateCooldownUntil = Date.now() + this.OPTIMISTIC_COOLDOWN_MS;
	}

	/**
	 * Set cooldown for shuffle state
	 */
	setShuffleCooldown(): void {
		this.shuffleCooldownUntil = Date.now() + this.OPTIMISTIC_COOLDOWN_MS;
	}

	/**
	 * Set cooldown for repeat state
	 */
	setRepeatCooldown(): void {
		this.repeatCooldownUntil = Date.now() + this.OPTIMISTIC_COOLDOWN_MS;
	}

	/**
	 * Update state from MPRIS
	 */
	async updateFromMpris(): Promise<void> {
		// Don't check isConnected() here - getNowPlaying() will auto-reconnect if needed
		const nowPlaying = await this.mpris.getNowPlaying();
		const now = Date.now();

		if (nowPlaying) {
			// Check cooldowns BEFORE creating the track object
			const inPlayCooldown = now <= this.playStateCooldownUntil;
			const inShuffleCooldown = now <= this.shuffleCooldownUntil;
			const inRepeatCooldown = now <= this.repeatCooldownUntil;

			// Get current state
			const state = this.stateManager.getState();
			const preservedIsPlaying = state.isPlaying;

			// Convert track data from MPRIS
			const currentTrack = this.convertToCurrentTrack(nowPlaying);

			// Apply cooldown logic - use cached state if in cooldown
			if (inPlayCooldown) {
				// Preserve our optimistic state
				const trackWithPreservedState = {
					...currentTrack,
					isPlaying: preservedIsPlaying,
				};
				this.stateManager.setCurrentTrack(trackWithPreservedState);
				// Don't update isPlaying state (keep optimistic update)
			} else {
				// Use MPRIS state
				const trackWithMprisState = {
					...currentTrack,
					isPlaying: nowPlaying.isPlaying,
				};
				this.stateManager.setCurrentTrack(trackWithMprisState);
				this.stateManager.setIsPlaying(nowPlaying.isPlaying);
			}

			// Update volume
			this.stateManager.setVolume(Math.round(nowPlaying.volume * 100));

			// Only update shuffle if not in cooldown
			if (!inShuffleCooldown) {
				this.stateManager.setShuffle(nowPlaying.shuffle);
			}

			// Only update repeat if not in cooldown
			if (!inRepeatCooldown) {
				this.stateManager.setRepeat(nowPlaying.loopStatus);
			}

			// Handle track changes and queue playback
			await this.handleTrackState(nowPlaying);
		} else {
			this.stateManager.setCurrentTrack(null);
			// Only update play state if not in cooldown
			if (now > this.playStateCooldownUntil) {
				this.stateManager.setIsPlaying(false);
			}
		}
	}

	/**
	 * Handle track state changes - sync visual queue and trigger queue playback
	 */
	async handleTrackState(nowPlaying: NowPlayingInfo): Promise<void> {
		// Skip if statusSidebar not yet initialized
		if (!this.statusSidebar) return;

		const currentTitle = nowPlaying.title;
		const positionMs = nowPlaying.positionMs;
		const durationMs = nowPlaying.durationMs;

		// Track changed - reset handled flag and sync visual queue
		if (currentTitle !== this.previousTrackTitle) {
			this.trackEndHandled = false;
			this.previousTrackTitle = currentTitle;

			// Check if the now playing track is the first item in our visual queue
			const queuePeek = this.statusSidebar.peekQueue();
			if (queuePeek && queuePeek.title === currentTitle) {
				// The queued track is now playing, remove it from visual queue
				this.statusSidebar.dequeue();
			}
		}

		// Get repeat mode for skip logic
		const repeatMode = this.getRepeatMode();

		// Skip queue playback logic if repeat track is enabled
		if (repeatMode === "Track") {
			return;
		}

		// Check if track is about to end (within last 2 seconds)
		const timeRemaining = durationMs - positionMs;
		const isAboutToEnd =
			timeRemaining > 0 &&
			timeRemaining < TRACK_END_THRESHOLD_MS &&
			durationMs > 0;

		// If track is about to end and we have queued items, play next from queue
		if (
			isAboutToEnd &&
			!this.trackEndHandled &&
			this.statusSidebar.hasQueuedItems()
		) {
			this.trackEndHandled = true;
			await this.playNextFromQueue();
		}
	}

	/**
	 * Play the next track from the queue
	 */
	async playNextFromQueue(): Promise<void> {
		if (!this.statusSidebar) return;

		const nextTrack = this.statusSidebar.dequeue();
		if (nextTrack) {
			try {
				await this.spotifyApi.playTrack(nextTrack.uri);
			} catch (_error) {
				// Failed to play, re-add to queue
				this.statusSidebar.addToQueue(nextTrack);
			}
		}
	}

	/**
	 * Convert MPRIS NowPlayingInfo to CurrentTrack
	 */
	convertToCurrentTrack(info: NowPlayingInfo): CurrentTrack {
		return {
			title: info.title,
			artist: info.artist,
			album: info.album,
			currentTime: this.formatTime(info.positionMs),
			totalTime: this.formatTime(info.durationMs),
			progress: info.durationMs > 0 ? info.positionMs / info.durationMs : 0,
			isPlaying: info.isPlaying,
		};
	}

	/**
	 * Format milliseconds to mm:ss
	 */
	formatTime(ms: number): string {
		const totalSeconds = Math.floor(ms / 1000);
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;
		return `${minutes}:${seconds.toString().padStart(2, "0")}`;
	}

	/**
	 * Get current repeat mode
	 */
	private getRepeatMode(): string {
		return this.stateManager.getState().repeat;
	}
}
