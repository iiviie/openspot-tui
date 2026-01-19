import type { IInputHandler } from "../interfaces";
import type { KeyEvent } from "../types";
import type { CommandPalette } from "../components/CommandPalette";
import type { SearchBar } from "../components/SearchBar";
import type { Sidebar } from "../components/Sidebar";
import type { ContentWindow } from "../components/ContentWindow";
import type { ToastManager } from "../components/ToastManager";
import type { PlaybackController } from "./PlaybackController";
import type { NavigationController } from "./NavigationController";
import type { StatusSidebar } from "../components";
import { KEY_BINDINGS } from "../config";
import { getLogger } from "../utils";

const logger = getLogger("InputHandler");

type FocusPanel = "library" | "content";
type InputMode = "normal" | "search";

/**
 * Input Handler
 * Routes keyboard input to appropriate handlers
 */
export class InputHandler implements IInputHandler {
	private focusedPanel: FocusPanel = "content";
	private inputMode: InputMode = "normal";

	constructor(
		private commandPalette: CommandPalette,
		private searchBar: SearchBar,
		private sidebar: Sidebar,
		private contentWindow: ContentWindow,
		private statusSidebar: StatusSidebar,
		private toastManager: ToastManager | null,
		private playbackController: PlaybackController,
		private navigationController: NavigationController,
		private onExit: () => void,
		private onRender: () => void,
	) {}

	/**
	 * Handle keyboard input based on current mode
	 */
	handleKeyPress(key: KeyEvent): void {
		// Check if toast manager handles the input first (highest priority)
		if (this.toastManager?.handleInput(key.name)) {
			this.onRender(); // Re-render if toast handled input
			return;
		}

		// If command palette is visible, route input to it
		if (this.commandPalette.getIsVisible()) {
			const handled = this.commandPalette.handleInput(
				key.name,
				key.ctrl ?? false,
			);
			if (handled) {
				this.commandPalette.render();
			}
			return;
		}

		if (this.inputMode === "search") {
			this.handleSearchModeInput(key);
		} else {
			this.handleNormalModeInput(key);
		}
	}

	/**
	 * Handle input in normal mode
	 */
	handleNormalModeInput(key: KeyEvent): void {
		const keyName = key.name;

		// Quit
		if (key.ctrl && keyName === "c") {
			this.onExit();
			return;
		}

		// Command palette (Ctrl+P)
		if (key.ctrl && keyName === "p") {
			this.commandPalette.show();
			return;
		}

		if ((KEY_BINDINGS.quit as readonly string[]).includes(keyName)) {
			this.onExit();
			return;
		}

		// Enter search mode with /
		if (keyName === "/" || keyName === "slash") {
			this.inputMode = "search";
			this.searchBar.activate();
			return;
		}

		// Panel navigation with h/l
		if (keyName === "h") {
			this.focusedPanel = "library";
			this.updateFocus();
			return;
		}

		if (keyName === "l") {
			this.focusedPanel = "content";
			this.updateFocus();
			return;
		}

		// Escape to go back
		if (keyName === "escape") {
			this.navigationController.goBack();
			return;
		}

		// Navigation within focused panel
		if ((KEY_BINDINGS.up as readonly string[]).includes(keyName)) {
			if (this.focusedPanel === "library") {
				this.sidebar.selectPrevious();
			} else {
				this.contentWindow.selectPrevious();
			}
			return;
		}

		if ((KEY_BINDINGS.down as readonly string[]).includes(keyName)) {
			if (this.focusedPanel === "library") {
				this.sidebar.selectNext();
			} else {
				this.contentWindow.selectNext();
			}
			return;
		}

		// Selection with Enter
		if ((KEY_BINDINGS.select as readonly string[]).includes(keyName)) {
			if (this.focusedPanel === "library") {
				this.sidebar.selectCurrent();
			} else {
				this.contentWindow.selectCurrent();
			}
			return;
		}

		// Add to queue with f
		if (keyName === "f") {
			this.addSelectedToQueue();
			return;
		}

		// Playback controls
		this.handlePlaybackControls(keyName);
	}

	/**
	 * Handle input in search mode (typing in search bar)
	 */
	handleSearchModeInput(key: KeyEvent): void {
		const keyName = key.name;

		// Escape to cancel
		if (keyName === "escape") {
			this.searchBar.handleEscape();
			this.inputMode = "normal";
			return;
		}

		// Enter to submit
		if (keyName === "return" || keyName === "enter") {
			this.searchBar.handleEnter();
			this.inputMode = "normal";
			return;
		}

		// Backspace
		if (keyName === "backspace") {
			this.searchBar.handleBackspace();
			return;
		}

		// Regular character input
		if (key.name && key.name.length === 1) {
			this.searchBar.handleChar(key.name);
		} else if ((key as any).sequence && (key as any).sequence.length === 1) {
			// Handle shifted characters and special chars
			this.searchBar.handleChar((key as any).sequence);
		}
	}

	/**
	 * Handle playback-related key presses
	 */
	async handlePlaybackControls(keyName: string): Promise<void> {
		// Try to ensure MPRIS connection (auto-reconnect if needed)
		// This is handled by PlaybackController methods

		switch (keyName) {
			case "space":
				await this.playbackController.playPause();
				break;
			case "n":
				await this.playbackController.next();
				break;
			case "p":
				await this.playbackController.previous();
				break;
			case "equal": // + key
			case "plus":
				await this.playbackController.volumeUp();
				break;
			case "minus":
				await this.playbackController.volumeDown();
				break;
			case "right":
				await this.playbackController.seekForward();
				break;
			case "left":
				await this.playbackController.seekBackward();
				break;
			case "s":
				await this.playbackController.toggleShuffle();
				break;
			case "r":
				await this.playbackController.cycleRepeat();
				break;
		}
	}

	/**
	 * Update visual focus indicators
	 */
	private updateFocus(): void {
		this.sidebar.setFocused(this.focusedPanel === "library");
		this.contentWindow.setFocused(this.focusedPanel === "content");
	}

	/**
	 * Add selected track to the queue
	 */
	private async addSelectedToQueue(): Promise<void> {
		// Only works when content panel is focused and showing tracks
		if (this.focusedPanel !== "content") return;

		const selected = this.contentWindow.getSelectedItem();
		if (!selected || selected.type !== "track") return;

		// Always add to visual queue for display
		this.statusSidebar.addToQueue({
			uri: selected.uri,
			title: selected.title,
			artist: selected.subtitle,
		});

		// Try to add to Spotify's native queue (requires active playback)
		try {
			const { getSpotifyApiService } = await import("../services");
			const spotifyApi = getSpotifyApiService();
			await spotifyApi.addToQueue(selected.uri);
		} catch (_error) {
			// Spotify API failed (likely no active playback)
			// Our custom queue logic will handle playback instead
		}
	}

	/**
	 * Activate search mode
	 */
	activateSearch(): void {
		this.inputMode = "search";
		this.searchBar.activate();
	}

	/**
	 * Focus library panel
	 */
	focusLibrary(): void {
		this.focusedPanel = "library";
		this.updateFocus();
	}

	/**
	 * Focus content panel
	 */
	focusContent(): void {
		this.focusedPanel = "content";
		this.updateFocus();
	}
}
