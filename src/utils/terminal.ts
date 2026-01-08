import { spawnSync } from "child_process";
import type { LayoutDimensions } from "../types";
import { SIDEBAR_WIDTH, STATUS_BAR_HEIGHT, MIN_TERM_WIDTH, MIN_TERM_HEIGHT } from "../config";

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
 */
export function calculateLayout(): LayoutDimensions {
  const { width: termWidth, height: termHeight } = getTerminalSize();
  
  return {
    termWidth,
    termHeight,
    sidebarWidth: SIDEBAR_WIDTH,
    mainWidth: termWidth - SIDEBAR_WIDTH,
    contentHeight: termHeight - STATUS_BAR_HEIGHT,
    statusBarHeight: STATUS_BAR_HEIGHT,
  };
}
