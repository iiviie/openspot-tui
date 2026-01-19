import type { IPlaybackController } from "../interfaces";
import type { IMprisService, LoopStatus } from "../types/mpris";
import type { CurrentTrack } from "../types";
import type { StatusSidebar, NowPlaying } from "../components";
import type { MprisStateManager } from "./MprisStateManager";
import type { StateManager } from "../state";
import { SEEK_STEP_MS } from "../config";
import { getLogger } from "../utils";

const logger = getLogger("PlaybackController");

/**
 * Playback Controller
 * Handles all playback controls: play/pause, volume, shuffle, repeat, seek
 */
export class PlaybackController implements IPlaybackController {
	// Debounce tracking for rapid key presses (prevents D-Bus spam)
	private readonly DEBOUNCE_MS = 150; // Minimum ms between same-key presses
	private lastPlayPauseTime: number = 0;
	private lastShuffleTime: number = 0;
	private lastRepeatTime: number = 0;

	constructor(
		private mpris: IMprisService,
		private stateManager: StateManager,
		private mprisStateManager: MprisStateManager,
		private statusSidebar: StatusSidebar | null,
		private nowPlaying: NowPlaying | null,
		private onActionFeedback: (action: string) => void,
	) {}

	/**
	 * Toggle play/pause with optimistic UI update
	 */
	async playPause(): Promise<void> {
		// Debounce: ignore rapid presses within DEBOUNCE_MS
		const now = Date.now();
		if (now - this.lastPlayPauseTime < this.DEBOUNCE_MS) {
			return;
		}
		this.lastPlayPauseTime = now;

		// Get current state
		const state = this.stateManager.getState();

		// OPTIMISTIC UPDATE: Update UI immediately BEFORE D-Bus call
		const newIsPlaying = !state.isPlaying;
		this.stateManager.setIsPlaying(newIsPlaying);

		// Update current track playing state
		if (state.currentTrack) {
			const updatedTrack = { ...state.currentTrack, isPlaying: newIsPlaying };
			this.stateManager.setCurrentTrack(updatedTrack);
		}

		this.mprisStateManager.setPlayStateCooldown();
		this.updateUI();

		// Show action feedback
		this.onActionFeedback(newIsPlaying ? "Playing" : "Paused");

		// Fire-and-forget: Send D-Bus command without blocking UI
		this.mpris.playPause().catch(() => {
			// If D-Bus fails, revert the optimistic update
			this.stateManager.setIsPlaying(state.isPlaying);
			if (state.currentTrack) {
				this.stateManager.setCurrentTrack(state.currentTrack);
			}
			this.onActionFeedback("Command failed");
		});
	}

	/**
	 * Play next track (from queue or MPRIS)
	 */
	async next(): Promise<void> {
		this.onActionFeedback("Next track");

		// Play from queue if available, otherwise use MPRIS next
		if (this.statusSidebar?.hasQueuedItems()) {
			await this.mprisStateManager.playNextFromQueue();
		} else {
			await this.mpris.next();
		}
	}

	/**
	 * Play previous track
	 */
	async previous(): Promise<void> {
		this.onActionFeedback("Previous track");
		await this.mpris.previous();
	}

	/**
	 * Seek forward by milliseconds
	 */
	async seekForward(ms: number = SEEK_STEP_MS): Promise<void> {
		this.onActionFeedback("Seek forward");
		await this.mpris.seekForward(ms);
	}

	/**
	 * Seek backward by milliseconds
	 */
	async seekBackward(ms: number = SEEK_STEP_MS): Promise<void> {
		this.onActionFeedback("Seek backward");
		await this.mpris.seekBackward(ms);
	}

	/**
	 * Increase volume
	 */
	async volumeUp(): Promise<void> {
		this.onActionFeedback("Volume up");
		await this.mpris.volumeUp();
	}

	/**
	 * Decrease volume
	 */
	async volumeDown(): Promise<void> {
		this.onActionFeedback("Volume down");
		await this.mpris.volumeDown();
	}

	/**
	 * Toggle shuffle mode with optimistic UI update
	 */
	async toggleShuffle(): Promise<void> {
		// Debounce: ignore rapid presses
		const now = Date.now();
		if (now - this.lastShuffleTime < this.DEBOUNCE_MS) {
			return;
		}
		this.lastShuffleTime = now;

		// Get current shuffle state
		const currentShuffle = this.getCurrentShuffle();

		// OPTIMISTIC UPDATE: Update UI immediately BEFORE D-Bus call
		const previousShuffle = currentShuffle;
		const newShuffle = !currentShuffle;
		this.stateManager.setShuffle(newShuffle);
		this.mprisStateManager.setShuffleCooldown();
		this.updateUI();

		// Show action feedback
		this.onActionFeedback(newShuffle ? "Shuffle ON" : "Shuffle OFF");

		// Fire-and-forget: Send D-Bus command without blocking UI
		this.mpris.toggleShuffle(previousShuffle).catch(() => {
			// If D-Bus fails, revert
			this.stateManager.setShuffle(previousShuffle);
			this.onActionFeedback("Command failed");
		});
	}

	/**
	 * Cycle through repeat modes (None → Playlist → Track → None)
	 */
	async cycleRepeat(): Promise<void> {
		// Debounce: ignore rapid presses
		const now = Date.now();
		if (now - this.lastRepeatTime < this.DEBOUNCE_MS) {
			return;
		}
		this.lastRepeatTime = now;

		// Get current repeat mode
		const currentRepeat = this.getCurrentRepeat();

		// OPTIMISTIC UPDATE: Update UI immediately BEFORE D-Bus call
		const previousRepeat = currentRepeat;
		const nextRepeat =
			currentRepeat === "None"
				? "Playlist"
				: currentRepeat === "Playlist"
					? "Track"
					: "None";
		this.stateManager.setRepeat(nextRepeat);
		this.mprisStateManager.setRepeatCooldown();
		this.updateUI();

		// Show action feedback
		this.onActionFeedback(`Repeat: ${nextRepeat}`);

		// Fire-and-forget: Send D-Bus command without blocking UI
		this.mpris.cycleLoopStatus(previousRepeat).catch(() => {
			// If D-Bus fails, revert
			this.stateManager.setRepeat(previousRepeat);
			this.onActionFeedback("Command failed");
		});
	}

	/**
	 * Update UI components after state changes
	 */
	private updateUI(): void {
		const state = this.stateManager.getState();
		const volume = this.getCurrentVolume();
		const shuffle = this.getCurrentShuffle();
		const repeat = this.getCurrentRepeat();

		this.nowPlaying?.updateTrack(state.currentTrack);
		this.statusSidebar?.updateStatus(
			state.currentTrack,
			volume,
			shuffle,
			repeat,
		);
	}

	/**
	 * Get current volume
	 */
	private getCurrentVolume(): number {
		return this.stateManager.getState().volume;
	}

	/**
	 * Get current shuffle state
	 */
	private getCurrentShuffle(): boolean {
		return this.stateManager.getState().shuffle;
	}

	/**
	 * Get current repeat mode
	 */
	private getCurrentRepeat(): LoopStatus {
		return this.stateManager.getState().repeat as LoopStatus;
	}
}
