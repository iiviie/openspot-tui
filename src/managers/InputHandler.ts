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
			await this.eventBus.emit("ui:commandPaletteOpened", undefined);
			return true;
		}

		// Playback controls
		if ((KEY_BINDINGS.playPause as readonly string[]).includes(key.name)) {
			await this.mpris.playPause();
			await this.eventBus.emit(
				this.stateManager.isPlaying() ? "playback:pause" : "playback:play",
				undefined,
			);
			return true;
		}

		if ((KEY_BINDINGS.next as readonly string[]).includes(key.name)) {
			await this.mpris.next();
			await this.eventBus.emit("playback:next", undefined);
			return true;
		}

		if ((KEY_BINDINGS.previous as readonly string[]).includes(key.name)) {
			await this.mpris.previous();
			await this.eventBus.emit("playback:previous", undefined);
			return true;
		}

		// Seek controls (using arrow keys)
		if (key.name === "right" && key.shift) {
			await this.mpris.seekForward(SEEK_STEP_MS);
			return true;
		}

		if (key.name === "left" && key.shift) {
			await this.mpris.seekBackward(SEEK_STEP_MS);
			return true;
		}

		// Volume controls (using + and -)
		if (key.name === "+" || key.name === "=") {
			await this.mpris.volumeUp(0.05);
			return true;
		}

		if (key.name === "-" || key.name === "_") {
			await this.mpris.volumeDown(0.05);
			return true;
		}

		// Shuffle and repeat (using s and r)
		if (key.name === "s") {
			const currentShuffle = this.stateManager.getShuffle();
			const newShuffle = await this.mpris.toggleShuffle(currentShuffle);
			this.eventBus.emit("playback:shuffleChanged", { shuffle: newShuffle });
			return true;
		}

		if (key.name === "r") {
			const currentLoop = this.stateManager.getRepeat();
			const newLoop = await this.mpris.cycleLoopStatus(currentLoop);
			this.eventBus.emit("playback:loopChanged", { loopStatus: newLoop });
			return true;
		}

		// Focus switching (using 1, 2, 3)
		if (key.name === "1") {
			this.stateManager.setFocus("sidebar");
			return true;
		}

		if (key.name === "2") {
			this.stateManager.setFocus("content");
			return true;
		}

		if (key.name === "3") {
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
			if (selectedTrack?.uri) {
				await this.spotifyApi.playTrack(selectedTrack.uri);
			}
		} else if (key.name === "a") {
			// Add to queue
			const selectedTrack = this.stateManager.getSelectedTrack();
			if (selectedTrack?.uri) {
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
				if (track.uri) {
					await this.spotifyApi.playTrack(track.uri);
				}
			}
		} else if (key.name === "d" || key.name === "delete") {
			// Remove from queue
			if (selectedIndex >= 0 && selectedIndex < queue.length) {
				const track = queue[selectedIndex];
				if (track.uri) {
					this.stateManager.removeFromQueue(track.uri);
				}
			}
		}
	}
}
