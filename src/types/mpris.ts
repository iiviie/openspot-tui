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

/**
 * Common interface for MPRIS services
 * Both MprisService (TypeScript/dbus-next) and NativeMprisAdapter (Rust/zbus)
 * implement this interface to allow drop-in replacement.
 */
export interface IMprisService {
	// Connection management
	connect(): Promise<boolean>;
	disconnect(): Promise<void> | void;
	isConnected(): boolean;
	ensureConnection(): Promise<boolean>;

	// Playback controls
	play(): Promise<void>;
	pause(): Promise<void>;
	playPause(): Promise<void>;
	next(): Promise<void>;
	previous(): Promise<void>;
	stop(): Promise<void>;
	seek(offsetMicroseconds: number): Promise<void>;
	setPosition(trackId: string, positionMicroseconds: number): Promise<void>;

	// Properties
	getPlaybackStatus(): Promise<PlaybackStatus>;
	getMetadata(): Promise<MprisMetadata | null>;
	getPosition(): Promise<number>;
	getVolume(): Promise<number>;
	setVolume(volume: number): Promise<void>;
	getShuffle(): Promise<boolean>;
	setShuffle(shuffle: boolean): Promise<void>;
	getLoopStatus(): Promise<LoopStatus>;
	setLoopStatus(status: LoopStatus): Promise<void>;

	// Convenience methods
	getPlayerState(): Promise<MprisPlayerState | null>;
	getNowPlaying(): Promise<NowPlayingInfo | null>;
	volumeUp(amount?: number): Promise<void>;
	volumeDown(amount?: number): Promise<void>;
	toggleShuffle(currentState?: boolean): Promise<boolean>;
	cycleLoopStatus(currentStatus?: LoopStatus): Promise<LoopStatus>;
	seekForward(ms?: number): Promise<void>;
	seekBackward(ms?: number): Promise<void>;
}
