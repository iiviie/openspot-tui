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
export const LEFT_SIDEBAR_WIDTH = 28;   // Library sidebar
export const RIGHT_SIDEBAR_WIDTH = 28;  // Status sidebar
export const SEARCH_BAR_HEIGHT = 3;     // Search bar at top of center
export const NOW_PLAYING_HEIGHT = 5;    // Now playing bar at bottom
export const MIN_TERM_WIDTH = 100;
export const MIN_TERM_HEIGHT = 24;

// Legacy exports for compatibility
export const SIDEBAR_WIDTH = LEFT_SIDEBAR_WIDTH;
export const STATUS_BAR_HEIGHT = NOW_PLAYING_HEIGHT;

/**
 * Playback constants
 */
export const TRACK_END_THRESHOLD_MS = 2000;  // Detect track end within 2s of completion
export const SEEK_STEP_MS = 5000;            // Seek forward/backward by 5s
export const UPDATE_INTERVAL_MS = 1000;      // Update UI every second
export const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // Refresh token 5 min before expiry

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
