/**
 * Input Handler
 * Centralized keyboard input handling
 */

import { KEY_BINDINGS, SEEK_STEP_MS } from "../config";
import { getAppEventBus } from "../events";
import type { KeyEvent } from "../types";
import type { CommandPalette } from "../components";
import type { StateManager } from "./StateManager";
import type { MprisService, SpotifyApiService } from "../services";

/**
 * Handles keyboard input and maps to actions
 */
export class InputHandler {
	private eventBus = getAppEventBus();

	constructor(
		private stateManager: StateManager,
		private mpris: MprisService,
		private spotifyApi: SpotifyApiService,
		private commandPalette: CommandPalette,
	) {}

	/**
	 * Handle keyboard input
	 */
	async handleInput(key: KeyEvent): Promise<void> {
		// Check if command palette is open
		if (this.commandPalette.getIsVisible()) {
			// Let command palette handle input
			this.commandPalette.handleInput(key.name, key.ctrl);
			return;
		}

		// Global key bindings (work regardless of focus)
		if (await this.handleGlobalKeys(key)) {
			return;
		}

		// Focus-specific key bindings
		const focus = this.stateManager.getFocus();

		switch (focus) {
			case "sidebar":
				await this.handleSidebarKeys(key);
				break;
			case "content":
				await this.handleContentKeys(key);
				break;
			case "queue":
				await this.handleQueueKeys(key);
				break;
		}
	}

	/**
	 * Handle global key bindings
	 */
	private async handleGlobalKeys(key: KeyEvent): Promise<boolean> {
		// Command palette
		if (key.ctrl && key.name === "p") {
			this.commandPalette.show();
			this.eventBus.emitSync("ui:commandPaletteOpened");
			return true;
		}

		// Playback controls
		if (key.name === KEY_BINDINGS.PLAY_PAUSE) {
			await this.mpris.playPause();
			this.eventBus.emitSync(
				this.stateManager.isPlaying() ? "playback:pause" : "playback:play",
			);
			return true;
		}

		if (key.name === KEY_BINDINGS.NEXT) {
			await this.mpris.next();
			this.eventBus.emitSync("playback:next");
			return true;
		}

		if (key.name === KEY_BINDINGS.PREVIOUS) {
			await this.mpris.previous();
			this.eventBus.emitSync("playback:previous");
			return true;
		}

		if (key.name === KEY_BINDINGS.SEEK_FORWARD) {
			await this.mpris.seekForward(SEEK_STEP_MS);
			return true;
		}

		if (key.name === KEY_BINDINGS.SEEK_BACKWARD) {
			await this.mpris.seekBackward(SEEK_STEP_MS);
			return true;
		}

		// Volume controls
		if (key.name === KEY_BINDINGS.VOLUME_UP) {
			await this.mpris.volumeUp(0.05);
			return true;
		}

		if (key.name === KEY_BINDINGS.VOLUME_DOWN) {
			await this.mpris.volumeDown(0.05);
			return true;
		}

		// Shuffle and repeat
		if (key.name === KEY_BINDINGS.SHUFFLE) {
			const currentShuffle = this.stateManager.getShuffle();
			const newShuffle = await this.mpris.toggleShuffle(currentShuffle);
			this.eventBus.emitSync("playback:shuffleChanged", { shuffle: newShuffle });
			return true;
		}

		if (key.name === KEY_BINDINGS.REPEAT) {
			const currentLoop = this.stateManager.getRepeat();
			const newLoop = await this.mpris.cycleLoopStatus(currentLoop);
			this.eventBus.emitSync("playback:loopChanged", { loopStatus: newLoop });
			return true;
		}

		// Focus switching
		if (key.name === KEY_BINDINGS.FOCUS_SIDEBAR) {
			this.stateManager.setFocus("sidebar");
			return true;
		}

		if (key.name === KEY_BINDINGS.FOCUS_CONTENT) {
			this.stateManager.setFocus("content");
			return true;
		}

		if (key.name === KEY_BINDINGS.FOCUS_QUEUE) {
			this.stateManager.setFocus("queue");
			return true;
		}

		return false;
	}

	/**
	 * Handle sidebar-specific keys
	 */
	private async handleSidebarKeys(key: KeyEvent): Promise<void> {
		const items = this.stateManager.getSidebarItems();
		const selectedIndex = this.stateManager.getSelectedSidebarIndex();

		if (key.name === "up" || (key.ctrl && key.name === "p")) {
			if (selectedIndex > 0) {
				this.stateManager.setSelectedSidebarIndex(selectedIndex - 1);
			}
		} else if (key.name === "down" || (key.ctrl && key.name === "n")) {
			if (selectedIndex < items.length - 1) {
				this.stateManager.setSelectedSidebarIndex(selectedIndex + 1);
			}
		} else if (key.name === "return") {
			const selectedItem = this.stateManager.getSelectedSidebarItem();
			if (selectedItem?.action) {
				await selectedItem.action();
			}
		}
	}

	/**
	 * Handle content window keys
	 */
	private async handleContentKeys(key: KeyEvent): Promise<void> {
		const tracks = this.stateManager.getTracks();
		const selectedIndex = this.stateManager.getSelectedTrackIndex();

		if (key.name === "up" || (key.ctrl && key.name === "p")) {
			if (selectedIndex > 0) {
				this.stateManager.setSelectedTrackIndex(selectedIndex - 1);
			}
		} else if (key.name === "down" || (key.ctrl && key.name === "n")) {
			if (selectedIndex < tracks.length - 1) {
				this.stateManager.setSelectedTrackIndex(selectedIndex + 1);
			}
		} else if (key.name === "return") {
			const selectedTrack = this.stateManager.getSelectedTrack();
			if (selectedTrack) {
				await this.spotifyApi.playTrack(selectedTrack.uri);
			}
		} else if (key.name === KEY_BINDINGS.ADD_TO_QUEUE) {
			const selectedTrack = this.stateManager.getSelectedTrack();
			if (selectedTrack) {
				await this.spotifyApi.addToQueue(selectedTrack.uri);
				this.stateManager.addToQueue(selectedTrack);
			}
		}
	}

	/**
	 * Handle queue window keys
	 */
	private async handleQueueKeys(key: KeyEvent): Promise<void> {
		const queue = this.stateManager.getQueue();
		const selectedIndex = this.stateManager.getSelectedTrackIndex();

		if (key.name === "up" || (key.ctrl && key.name === "p")) {
			if (selectedIndex > 0) {
				this.stateManager.setSelectedTrackIndex(selectedIndex - 1);
			}
		} else if (key.name === "down" || (key.ctrl && key.name === "n")) {
			if (selectedIndex < queue.length - 1) {
				this.stateManager.setSelectedTrackIndex(selectedIndex + 1);
			}
		} else if (key.name === "return") {
			if (selectedIndex >= 0 && selectedIndex < queue.length) {
				const track = queue[selectedIndex];
				await this.spotifyApi.playTrack(track.uri);
			}
		} else if (key.name === KEY_BINDINGS.REMOVE_FROM_QUEUE) {
			if (selectedIndex >= 0 && selectedIndex < queue.length) {
				const track = queue[selectedIndex];
				this.stateManager.removeFromQueue(track.uri);
			}
		}
	}
}
