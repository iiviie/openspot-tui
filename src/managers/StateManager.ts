/**
 * State Manager
 * Centralized application state management
 */

import { getAppEventBus } from "../events";
import type {
	AppState,
	CurrentTrack,
	FocusPanel,
	MenuItem,
	Track,
} from "../types";

/**
 * Manages application state with event-driven updates
 */
export class StateManager {
	private state: AppState;
	private eventBus = getAppEventBus();

	constructor() {
		this.state = {
			selectedMenuIndex: 0,
			currentTrack: null,
			isPlaying: false,
			position: 0,
			duration: 0,
			volume: 1.0,
			shuffle: false,
			repeat: "None",
			queue: [],
			tracks: [],
			selectedTrackIndex: 0,
			focus: "sidebar",
			sidebarItems: [],
			selectedSidebarIndex: 0,
		};

		this.setupEventListeners();
	}

	/**
	 * Set up event listeners for state changes
	 */
	private setupEventListeners(): void {
		// Listen to playback state changes
		this.eventBus.on("playback:stateChanged", (data) => {
			this.state.isPlaying = data.isPlaying;
			this.state.position = data.position;
			this.state.duration = data.duration;
			this.state.volume = data.volume;
			this.state.shuffle = data.shuffle;
			this.state.repeat = data.loopStatus;
		});

		// Listen to track changes
		this.eventBus.on("playback:trackChanged", (data) => {
			this.state.currentTrack = {
				title: data.title,
				artist: data.artist,
				album: data.album,
				artUrl: data.artUrl,
				uri: data.uri,
				currentTime: "0:00",
				totalTime: `${Math.floor(data.duration / 60)}:${String(data.duration % 60).padStart(2, "0")}`,
				progress: 0,
				isPlaying: this.state.isPlaying,
			};
			this.state.duration = data.duration;
		});

		// Listen to queue updates
		this.eventBus.on("queue:updated", (data) => {
			this.state.queue = data.tracks;
		});

		// Listen to track list updates
		this.eventBus.on("trackList:updated", (data) => {
			this.state.tracks = data.tracks;
		});
	}

	// ─────────────────────────────────────────────────────────────
	// State Getters
	// ─────────────────────────────────────────────────────────────

	getState(): Readonly<AppState> {
		return this.state;
	}

	getCurrentTrack(): CurrentTrack | null {
		return this.state.currentTrack;
	}

	isPlaying(): boolean {
		return this.state.isPlaying;
	}

	getPosition(): number {
		return this.state.position;
	}

	getDuration(): number {
		return this.state.duration;
	}

	getVolume(): number {
		return this.state.volume;
	}

	getShuffle(): boolean {
		return this.state.shuffle;
	}

	getRepeat(): "None" | "Playlist" | "Track" {
		return this.state.repeat;
	}

	getQueue(): Track[] {
		return this.state.queue;
	}

	getTracks(): Track[] {
		return this.state.tracks;
	}

	getSelectedTrackIndex(): number {
		return this.state.selectedTrackIndex;
	}

	getFocus(): FocusPanel {
		return this.state.focus;
	}

	getSidebarItems(): MenuItem[] {
		return this.state.sidebarItems;
	}

	getSelectedSidebarIndex(): number {
		return this.state.selectedSidebarIndex;
	}

	// ─────────────────────────────────────────────────────────────
	// State Setters
	// ─────────────────────────────────────────────────────────────

	setCurrentTrack(track: CurrentTrack | null): void {
		this.state.currentTrack = track;
	}

	setIsPlaying(isPlaying: boolean): void {
		this.state.isPlaying = isPlaying;
	}

	setPosition(position: number): void {
		this.state.position = position;
	}

	setDuration(duration: number): void {
		this.state.duration = duration;
	}

	setVolume(volume: number): void {
		this.state.volume = volume;
	}

	setShuffle(shuffle: boolean): void {
		this.state.shuffle = shuffle;
	}

	setRepeat(repeat: "None" | "Playlist" | "Track"): void {
		this.state.repeat = repeat;
	}

	setQueue(queue: Track[]): void {
		this.state.queue = queue;
		this.eventBus.emit("queue:updated", { tracks: queue });
	}

	setTracks(tracks: Track[], source: "playlist" | "album" | "search" | "saved"): void {
		this.state.tracks = tracks;
		this.eventBus.emit("trackList:updated", { tracks, source });
	}

	setSelectedTrackIndex(index: number): void {
		this.state.selectedTrackIndex = index;
		this.eventBus.emit("trackList:selectionChanged", { index });
	}

	setFocus(focus: FocusPanel): void {
		this.state.focus = focus;
		this.eventBus.emit("ui:focusChanged", { panel: focus });
	}

	setSidebarItems(items: MenuItem[]): void {
		this.state.sidebarItems = items;
	}

	setSelectedSidebarIndex(index: number): void {
		this.state.selectedSidebarIndex = index;
	}

	// ─────────────────────────────────────────────────────────────
	// Helper Methods
	// ─────────────────────────────────────────────────────────────

	/**
	 * Add track to queue
	 */
	addToQueue(track: Track): void {
		this.state.queue.push(track);
		this.eventBus.emit("queue:updated", { tracks: this.state.queue });
		this.eventBus.emit("queue:trackAdded", { track });
	}

	/**
	 * Remove track from queue by URI
	 */
	removeFromQueue(trackUri: string): void {
		this.state.queue = this.state.queue.filter((t) => t.uri !== trackUri);
		this.eventBus.emit("queue:updated", { tracks: this.state.queue });
		this.eventBus.emit("queue:trackRemoved", { trackUri });
	}

	/**
	 * Clear queue
	 */
	clearQueue(): void {
		this.state.queue = [];
		this.eventBus.emit("queue:updated", { tracks: [] });
		this.eventBus.emit("queue:cleared", undefined);
	}

	/**
	 * Get selected track from track list
	 */
	getSelectedTrack(): Track | null {
		if (
			this.state.selectedTrackIndex >= 0 &&
			this.state.selectedTrackIndex < this.state.tracks.length
		) {
			return this.state.tracks[this.state.selectedTrackIndex];
		}
		return null;
	}

	/**
	 * Get selected sidebar item
	 */
	getSelectedSidebarItem(): MenuItem | null {
		if (
			this.state.selectedSidebarIndex >= 0 &&
			this.state.selectedSidebarIndex < this.state.sidebarItems.length
		) {
			return this.state.sidebarItems[this.state.selectedSidebarIndex];
		}
		return null;
	}
}
