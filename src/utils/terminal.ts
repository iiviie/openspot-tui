import { spawnSync } from "node:child_process";
import {
	LEFT_SIDEBAR_WIDTH,
	MIN_TERM_HEIGHT,
	MIN_TERM_WIDTH,
	NOW_PLAYING_HEIGHT,
	RIGHT_SIDEBAR_WIDTH,
	SEARCH_BAR_HEIGHT,
} from "../config";
import type { LayoutDimensions } from "../types";

/**
 * ANSI escape sequences for terminal control
 */
const ESCAPE_SEQUENCES = {
	// Mouse tracking modes
	MOUSE_CLICK_OFF: "\x1b[?1000l",
	MOUSE_BUTTON_OFF: "\x1b[?1002l",
	MOUSE_ALL_OFF: "\x1b[?1003l",
	MOUSE_SGR_OFF: "\x1b[?1006l",
	MOUSE_URXVT_OFF: "\x1b[?1015l",

	// Cursor
	CURSOR_SHOW: "\x1b[?25h",
	CURSOR_HIDE: "\x1b[?25h",

	// Screen buffer
	ALT_SCREEN_OFF: "\x1b[?1049l",

	// Clear and reset
	CLEAR_SCREEN: "\x1b[2J\x1b[H",
	RESET_ATTRS: "\x1b[0m",
} as const;

/**
 * Disable all mouse tracking modes
 */
function disableMouseTracking(): void {
	process.stdout.write(ESCAPE_SEQUENCES.MOUSE_CLICK_OFF);
	process.stdout.write(ESCAPE_SEQUENCES.MOUSE_BUTTON_OFF);
	process.stdout.write(ESCAPE_SEQUENCES.MOUSE_ALL_OFF);
	process.stdout.write(ESCAPE_SEQUENCES.MOUSE_SGR_OFF);
	process.stdout.write(ESCAPE_SEQUENCES.MOUSE_URXVT_OFF);
}

/**
 * Reset terminal visual state
 */
function resetTerminalVisuals(): void {
	process.stdout.write(ESCAPE_SEQUENCES.CURSOR_SHOW);
	process.stdout.write(ESCAPE_SEQUENCES.ALT_SCREEN_OFF);
	process.stdout.write(ESCAPE_SEQUENCES.CLEAR_SCREEN);
	process.stdout.write(ESCAPE_SEQUENCES.RESET_ATTRS);
}

/**
 * Use stty to reset terminal to sane state
 */
function resetTerminalState(): void {
	try {
		spawnSync("stty", ["sane"], { stdio: "inherit" });
	} catch {
		// Ignore if stty fails (e.g., on Windows)
	}
}

/**
 * Comprehensive terminal cleanup
 * Call this before exiting the application
 */
export function cleanupTerminal(): void {
	disableMouseTracking();
	resetTerminalVisuals();
	resetTerminalState();
}

/**
 * Get current terminal dimensions
 */
export function getTerminalSize(): { width: number; height: number } {
	return {
		width: Math.max(process.stdout.columns || MIN_TERM_WIDTH, MIN_TERM_WIDTH),
		height: Math.max(process.stdout.rows || MIN_TERM_HEIGHT, MIN_TERM_HEIGHT),
	};
}

/**
 * Calculate layout dimensions based on terminal size
 *
 * Layout:
 * +----------+---------------------------+----------+
 * |          |       SEARCH BAR          |          |
 * |          +---------------------------+          |
 * |  LIBRARY |                           |  STATUS  |
 * |          |     CONTENT WINDOW        |          |
 * |          |                           |          |
 * +----------+---------------------------+----------+
 * |              NOW PLAYING                        |
 * +-------------------------------------------------+
 */
export function calculateLayout(): LayoutDimensions {
	const { width: termWidth, height: termHeight } = getTerminalSize();

	// Heights
	const upperSectionHeight = termHeight - NOW_PLAYING_HEIGHT;
	const searchBarY = 0;
	const contentWindowY = SEARCH_BAR_HEIGHT;
	const contentWindowHeight = upperSectionHeight - SEARCH_BAR_HEIGHT;
	const nowPlayingY = upperSectionHeight;

	// Widths
	const centerWidth = termWidth - LEFT_SIDEBAR_WIDTH - RIGHT_SIDEBAR_WIDTH;
	const centerX = LEFT_SIDEBAR_WIDTH;
	const rightSidebarX = termWidth - RIGHT_SIDEBAR_WIDTH;

	return {
		termWidth,
		termHeight,
		// Left sidebar (Library with welcome section inside)
		leftSidebarWidth: LEFT_SIDEBAR_WIDTH,
		leftSidebarHeight: upperSectionHeight,
		leftSidebarX: 0,
		leftSidebarY: 0,
		// Right sidebar (Status)
		rightSidebarWidth: RIGHT_SIDEBAR_WIDTH,
		rightSidebarHeight: upperSectionHeight,
		rightSidebarX: rightSidebarX,
		rightSidebarY: 0,
		// Center content area
		centerWidth,
		centerX,
		// Search bar (top of center)
		searchBarHeight: SEARCH_BAR_HEIGHT,
		searchBarY,
		// Content window (main center area)
		contentWindowHeight,
		contentWindowY,
		// Now playing bar (bottom full width)
		nowPlayingHeight: NOW_PLAYING_HEIGHT,
		nowPlayingY,
		// Legacy (for compatibility)
		sidebarWidth: LEFT_SIDEBAR_WIDTH,
		mainWidth: centerWidth,
		contentHeight: upperSectionHeight,
		statusBarHeight: NOW_PLAYING_HEIGHT,
	};
}
