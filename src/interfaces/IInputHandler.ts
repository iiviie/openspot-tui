import type { KeyEvent } from "../types";

/**
 * Input Handler Interface
 * Routes keyboard input to appropriate handlers
 */

export interface IInputHandler {
	/**
	 * Handle keyboard input based on current mode
	 */
	handleKeyPress(key: KeyEvent): void;

	/**
	 * Handle input in normal mode
	 */
	handleNormalModeInput(key: KeyEvent): void;

	/**
	 * Handle input in search mode (typing in search bar)
	 */
	handleSearchModeInput(key: KeyEvent): void;

	/**
	 * Handle playback-related key presses
	 */
	handlePlaybackControls(keyName: string): Promise<void>;
}
