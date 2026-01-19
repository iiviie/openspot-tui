/**
 * Playback Controller Interface
 * Handles all playback controls: play/pause, volume, shuffle, repeat, seek
 */

export interface IPlaybackController {
	/**
	 * Toggle play/pause
	 */
	playPause(): Promise<void>;

	/**
	 * Play next track (from queue or MPRIS)
	 */
	next(): Promise<void>;

	/**
	 * Play previous track
	 */
	previous(): Promise<void>;

	/**
	 * Seek forward by milliseconds
	 */
	seekForward(ms: number): Promise<void>;

	/**
	 * Seek backward by milliseconds
	 */
	seekBackward(ms: number): Promise<void>;

	/**
	 * Increase volume
	 */
	volumeUp(): Promise<void>;

	/**
	 * Decrease volume
	 */
	volumeDown(): Promise<void>;

	/**
	 * Toggle shuffle mode
	 */
	toggleShuffle(): Promise<void>;

	/**
	 * Cycle through repeat modes (None → Playlist → Track → None)
	 */
	cycleRepeat(): Promise<void>;
}
