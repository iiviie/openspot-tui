/**
 * Application Event Bus
 * Centralized event system for state changes and UI updates
 */

import type { LoopStatus } from "../types/mpris";
import type { SpotifyTrack } from "../types/spotify";
import type { EventEmitter } from "./EventEmitter";
import { createEventEmitter } from "./EventEmitter";

/**
 * Playback state change event
 */
export interface PlaybackStateChanged {
	isPlaying: boolean;
	position: number;
	duration: number;
	volume: number;
	shuffle: boolean;
	loopStatus: LoopStatus;
}

/**
 * Track change event
 */
export interface TrackChanged {
	title: string;
	artist: string;
	album: string;
	artUrl: string;
	uri?: string;
	duration: number;
}

/**
 * Connection status change event
 */
export interface ConnectionStatusChanged {
	mpris: boolean;
	spotifyApi: boolean;
	spotifyd: boolean;
}

/**
 * Queue updated event
 */
export interface QueueUpdated {
	tracks: SpotifyTrack[];
}

/**
 * Track list updated event (for playlists, albums, etc.)
 */
export interface TrackListUpdated {
	tracks: SpotifyTrack[];
	source: "playlist" | "album" | "search" | "saved";
}

/**
 * Application event map
 * Maps event names to their payload types
 */
export interface AppEventMap {
	// Playback events
	"playback:stateChanged": PlaybackStateChanged;
	"playback:trackChanged": TrackChanged;
	"playback:play": void;
	"playback:pause": void;
	"playback:next": void;
	"playback:previous": void;
	"playback:seek": { position: number };
	"playback:volumeChanged": { volume: number };
	"playback:shuffleChanged": { shuffle: boolean };
	"playback:loopChanged": { loopStatus: LoopStatus };

	// Connection events
	"connection:statusChanged": ConnectionStatusChanged;
	"connection:mprisConnected": void;
	"connection:mprisDisconnected": void;
	"connection:apiConnected": void;
	"connection:apiDisconnected": void;

	// Queue events
	"queue:updated": QueueUpdated;
	"queue:trackAdded": { track: SpotifyTrack };
	"queue:trackRemoved": { trackUri: string };
	"queue:cleared": void;

	// Track list events
	"trackList:updated": TrackListUpdated;
	"trackList:selectionChanged": { index: number };

	// UI events
	"ui:focusChanged": { panel: "sidebar" | "content" | "queue" };
	"ui:commandPaletteOpened": void;
	"ui:commandPaletteClosed": void;
	"ui:terminalResized": { width: number; height: number };

	// Error events
	"error:playback": { message: string; error: unknown };
	"error:connection": { message: string; error: unknown };
	"error:api": { message: string; error: unknown };
}

/**
 * Global application event bus
 */
let appEventBus: EventEmitter<AppEventMap> | null = null;

/**
 * Get or create the global app event bus
 */
export function getAppEventBus(): EventEmitter<AppEventMap> {
	if (!appEventBus) {
		appEventBus = createEventEmitter<AppEventMap>();
	}
	return appEventBus;
}

/**
 * Reset the event bus (useful for testing)
 */
export function resetAppEventBus(): void {
	appEventBus?.removeAllListeners();
	appEventBus = null;
}
