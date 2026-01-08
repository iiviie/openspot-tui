import type { MenuItem } from "../types";

/**
 * Application name and version
 */
export const APP_NAME = "Spotify TUI";
export const APP_VERSION = "1.0.0";

/**
 * Layout constants
 */
export const SIDEBAR_WIDTH = 22;
export const STATUS_BAR_HEIGHT = 3;
export const MIN_TERM_WIDTH = 80;
export const MIN_TERM_HEIGHT = 24;

/**
 * Library menu items
 */
export const LIBRARY_MENU_ITEMS: MenuItem[] = [
  { id: "artists", label: "Artists" },
  { id: "albums", label: "Albums" },
  { id: "songs", label: "Songs" },
  { id: "playlists", label: "Playlists" },
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
