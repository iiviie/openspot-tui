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
export const LEFT_SIDEBAR_WIDTH = 20;   // Library sidebar
export const RIGHT_SIDEBAR_WIDTH = 22;  // Status sidebar
export const SEARCH_BAR_HEIGHT = 3;     // Search bar at top of center
export const NOW_PLAYING_HEIGHT = 5;    // Now playing bar at bottom
export const MIN_TERM_WIDTH = 100;
export const MIN_TERM_HEIGHT = 24;

// Legacy exports for compatibility
export const SIDEBAR_WIDTH = LEFT_SIDEBAR_WIDTH;
export const STATUS_BAR_HEIGHT = NOW_PLAYING_HEIGHT;

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
