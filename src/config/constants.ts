import type { MenuItem } from "../types";

/**
 * Application name and version
 */
export const APP_NAME = "Spotify TUI";
export const APP_VERSION = "1.0.0";

/**
 * Layout constants
 * New 3-column layout: [LIBRARY] [SEARCH/CONTENT] [STATUS]
 *                      [         NOW PLAYING            ]
 */
export const LEFT_SIDEBAR_WIDTH = 28; // Library sidebar
export const RIGHT_SIDEBAR_WIDTH = 28; // Status sidebar
export const SEARCH_BAR_HEIGHT = 3; // Search bar at top of center
export const NOW_PLAYING_HEIGHT = 5; // Now playing bar at bottom
export const MIN_TERM_WIDTH = 100;
export const MIN_TERM_HEIGHT = 24;

// Toast responsive dimensions
export const TOAST_MIN_WIDTH = 25;
export const TOAST_MAX_WIDTH = 60;
export const TOAST_WIDTH_PERCENT = 0.3; // 30% of terminal width

// Legacy exports for compatibility
export const SIDEBAR_WIDTH = LEFT_SIDEBAR_WIDTH;
export const STATUS_BAR_HEIGHT = NOW_PLAYING_HEIGHT;

/**
 * Playback constants
 */
export const TRACK_END_THRESHOLD_MS = 2000; // Detect track end within 2s of completion
export const SEEK_STEP_MS = 5000; // Seek forward/backward by 5s
export const UPDATE_INTERVAL_MS = 1000; // Update UI every second
export const PLAYBACK_UPDATE_DELAY_MS = 500; // Delay before updating UI after playback action

/**
 * Authentication constants
 */
export const AUTH_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes auth timeout
export const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // Refresh token 5 min before expiry
export const DEFAULT_CALLBACK_PORT = 8888;

/**
 * PKCE constants (OAuth 2.0)
 */
export const PKCE_VERIFIER_BYTES = 64; // Random bytes for code verifier
export const PKCE_VERIFIER_LENGTH = 128; // Final code verifier string length

/**
 * API constants
 */
export const SPOTIFY_API_BASE = "https://api.spotify.com/v1";
export const DEFAULT_RATE_LIMIT_RETRY_SECONDS = 5;

/**
 * Pagination defaults (Spotify API limits)
 */
export const API_LIMITS = {
	SAVED_TRACKS: 50, // Max 50 per request
	PLAYLISTS: 50, // Max 50 per request
	PLAYLIST_TRACKS: 100, // Max 100 per request
	SEARCH_RESULTS: 20, // Default search limit
	ALBUM_TRACKS: 50, // Max 50 per request
} as const;

/**
 * Cache configuration
 */
export const CACHE_CONFIG = {
	DEFAULT_TTL_MS: 5 * 60 * 1000, // 5 minutes default
	CLEANUP_INTERVAL_MS: 10 * 60 * 1000, // Garbage collection every 10 minutes
} as const;

/**
 * Cache TTL values (in milliseconds)
 */
export const CACHE_TTL = {
	SHORT: 2 * 60 * 1000, // 2 minutes - for search results
	MEDIUM: 5 * 60 * 1000, // 5 minutes - default
	LONG: 15 * 60 * 1000, // 15 minutes - for rarely changing data
	VERY_LONG: 60 * 60 * 1000, // 1 hour - for static data
} as const;

/**
 * HTTP Status Codes
 */
export const HTTP_STATUS = {
	OK: 200,
	NO_CONTENT: 204,
	RATE_LIMITED: 429,
} as const;

/**
 * Library menu items
 */
export const LIBRARY_MENU_ITEMS: MenuItem[] = [
	{ id: "songs", label: "Songs" },
	{ id: "playlists", label: "Playlists" },
	{ id: "albums", label: "Albums" },
	{ id: "artists", label: "Artists" },
];

/**
 * Key bindings
 */
export const KEY_BINDINGS = {
	quit: ["q"],
	up: ["up", "k"],
	down: ["down", "j"],
	select: ["return", "enter"],
	playPause: ["space"],
	next: ["n", "right"],
	previous: ["p", "left"],
} as const;

/**
 * UI strings
 */
export const UI_STRINGS = {
	library: "LIBRARY",
	nowPlaying: "NOW PLAYING",
	queue: "QUEUE",
	noTrack: "No track playing",
	controls: "[<] [>] [||]  q:quit",
} as const;

/**
 * Default market for Spotify API
 */
export const DEFAULT_MARKET = "US";
