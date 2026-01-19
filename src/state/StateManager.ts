import type { AppState, CurrentTrack, Track } from "../types";
import type { LoopStatus } from "../types/mpris";
import { getLogger } from "../utils";

const logger = getLogger("StateManager");

/**
 * State change listener callback
 */
type StateChangeListener = (state: AppState) => void;

/**
 * Centralized State Manager
 * Single source of truth for application state
 */
export class StateManager {
	private state: AppState;
	private listeners: Set<StateChangeListener> = new Set();

	constructor(initialState: AppState) {
		this.state = { ...initialState };
	}

	/**
	 * Get current state (immutable)
	 */
	getState(): Readonly<AppState> {
		return this.state;
	}

	/**
	 * Subscribe to state changes
	 */
	subscribe(listener: StateChangeListener): () => void {
		this.listeners.add(listener);
		// Return unsubscribe function
		return () => {
			this.listeners.delete(listener);
		};
	}

	/**
	 * Notify all listeners of state change
	 */
	private notifyListeners(): void {
		for (const listener of this.listeners) {
			try {
				listener(this.getState());
			} catch (error) {
				logger.error("Error in state change listener:", error);
			}
		}
	}

	// ─────────────────────────────────────────────────────────────
	// Playback State
	// ─────────────────────────────────────────────────────────────

	/**
	 * Update current track
	 */
	setCurrentTrack(track: CurrentTrack | null): void {
		this.state.currentTrack = track;
		this.notifyListeners();
	}

	/**
	 * Update playback state
	 */
	setIsPlaying(isPlaying: boolean): void {
		this.state.isPlaying = isPlaying;
		this.notifyListeners();
	}

	/**
	 * Update playback position
	 */
	setPosition(position: number): void {
		this.state.position = position;
		// Don't notify for position updates (too frequent)
	}

	/**
	 * Update duration
	 */
	setDuration(duration: number): void {
		this.state.duration = duration;
		this.notifyListeners();
	}

	/**
	 * Update volume
	 */
	setVolume(volume: number): void {
		this.state.volume = volume;
		this.notifyListeners();
	}

	/**
	 * Update shuffle state
	 */
	setShuffle(shuffle: boolean): void {
		this.state.shuffle = shuffle;
		this.notifyListeners();
	}

	/**
	 * Update repeat mode
	 */
	setRepeat(repeat: LoopStatus): void {
		this.state.repeat = repeat;
		this.notifyListeners();
	}

	// ─────────────────────────────────────────────────────────────
	// Queue State
	// ─────────────────────────────────────────────────────────────

	/**
	 * Set entire queue
	 */
	setQueue(queue: Track[]): void {
		this.state.queue = [...queue];
		this.notifyListeners();
	}

	/**
	 * Add track to queue
	 */
	addToQueue(track: Track): void {
		this.state.queue.push(track);
		this.notifyListeners();
	}

	/**
	 * Remove track from queue
	 */
	removeFromQueue(index: number): void {
		this.state.queue.splice(index, 1);
		this.notifyListeners();
	}

	/**
	 * Clear queue
	 */
	clearQueue(): void {
		this.state.queue = [];
		this.notifyListeners();
	}

	// ─────────────────────────────────────────────────────────────
	// Navigation State
	// ─────────────────────────────────────────────────────────────

	/**
	 * Update focused panel
	 */
	setFocus(focus: "sidebar" | "content" | "queue"): void {
		this.state.focus = focus;
		this.notifyListeners();
	}

	/**
	 * Update tracks list
	 */
	setTracks(tracks: Track[]): void {
		this.state.tracks = [...tracks];
		this.notifyListeners();
	}

	/**
	 * Update selected track index
	 */
	setSelectedTrackIndex(index: number): void {
		this.state.selectedTrackIndex = index;
		this.notifyListeners();
	}

	/**
	 * Update selected menu index
	 */
	setSelectedMenuIndex(index: number): void {
		this.state.selectedMenuIndex = index;
		this.notifyListeners();
	}

	/**
	 * Update selected sidebar index
	 */
	setSelectedSidebarIndex(index: number): void {
		this.state.selectedSidebarIndex = index;
		this.notifyListeners();
	}

	// ─────────────────────────────────────────────────────────────
	// Batch Updates
	// ─────────────────────────────────────────────────────────────

	/**
	 * Update multiple state properties at once
	 * Notifies listeners only once after all updates
	 */
	batchUpdate(updates: Partial<AppState>): void {
		Object.assign(this.state, updates);
		this.notifyListeners();
	}

	/**
	 * Reset state to initial values
	 */
	reset(initialState: AppState): void {
		this.state = { ...initialState };
		this.notifyListeners();
	}

	/**
	 * Dispose and cleanup (remove all listeners)
	 */
	dispose(): void {
		this.listeners.clear();
	}
}

/**
 * Singleton instance (for backward compatibility)
 */
let instance: StateManager | null = null;

/**
 * Get or create StateManager instance
 */
export function getStateManager(initialState?: AppState): StateManager {
	if (!instance) {
		if (!initialState) {
			throw new Error("StateManager requires initial state on first call");
		}
		instance = new StateManager(initialState);
	}
	return instance;
}

/**
 * Create a new StateManager instance (for testing)
 */
export function createStateManager(initialState: AppState): StateManager {
	return new StateManager(initialState);
}
