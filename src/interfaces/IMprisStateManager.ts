import type { CurrentTrack } from "../types";
import type { NowPlayingInfo } from "../types/mpris";

/**
 * MPRIS State Manager Interface
 * Polls MPRIS and updates application state
 */

export interface IMprisStateManager {
	/**
	 * Update state from MPRIS
	 */
	updateFromMpris(): Promise<void>;

	/**
	 * Convert MPRIS NowPlayingInfo to CurrentTrack
	 */
	convertToCurrentTrack(info: NowPlayingInfo): CurrentTrack;

	/**
	 * Format milliseconds to mm:ss
	 */
	formatTime(ms: number): string;

	/**
	 * Handle track state changes (queue sync and playback)
	 */
	handleTrackState(nowPlaying: NowPlayingInfo): Promise<void>;

	/**
	 * Play the next track from the queue
	 */
	playNextFromQueue(): Promise<void>;
}
