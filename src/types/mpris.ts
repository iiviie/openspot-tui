/**
 * MPRIS Types
 * Types for the MPRIS D-Bus interface
 */

/**
 * MPRIS Playback status
 */
export type PlaybackStatus = "Playing" | "Paused" | "Stopped";

/**
 * MPRIS Loop status
 */
export type LoopStatus = "None" | "Track" | "Playlist";

/**
 * Track metadata from MPRIS
 */
export interface MprisMetadata {
	trackId: string;
	title: string;
	artist: string[];
	album: string;
	albumArtist: string[];
	artUrl: string;
	length: number; // microseconds
	url: string;
}

/**
 * Current player state from MPRIS
 */
export interface MprisPlayerState {
	playbackStatus: PlaybackStatus;
	metadata: MprisMetadata | null;
	position: number; // microseconds
	volume: number; // 0.0 to 1.0
	canGoNext: boolean;
	canGoPrevious: boolean;
	canPlay: boolean;
	canPause: boolean;
	canSeek: boolean;
	shuffle: boolean;
	loopStatus: LoopStatus;
}

/**
 * Simplified track info for UI
 */
export interface NowPlayingInfo {
	title: string;
	artist: string;
	album: string;
	artUrl: string;
	durationMs: number;
	positionMs: number;
	isPlaying: boolean;
	volume: number;
	shuffle: boolean;
	loopStatus: LoopStatus;
}
