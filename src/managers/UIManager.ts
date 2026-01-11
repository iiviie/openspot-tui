/**
 * UI Manager
 * Manages UI components and rendering
 */

import {
	CommandPalette,
	ContentWindow,
	NowPlaying,
	SearchBar,
	Sidebar,
	StatusBar,
	StatusSidebar,
	type ConnectionStatus,
} from "../components";
import { getAppEventBus } from "../events";
import type { CliRenderer, LayoutDimensions, MenuItem } from "../types";
import type { SpotifyTrack } from "../types/spotify";
import type { StateManager } from "./StateManager";

/**
 * Manages all UI components
 */
export class UIManager {
	// UI Components
	private sidebar!: Sidebar;
	private contentWindow!: ContentWindow;
	private nowPlaying!: NowPlaying;
	private statusBar!: StatusBar;
	private statusSidebar!: StatusSidebar;
	private searchBar!: SearchBar;
	private commandPalette!: CommandPalette;

	private eventBus = getAppEventBus();

	constructor(
		private renderer: CliRenderer,
		private layout: LayoutDimensions,
		private stateManager: StateManager,
	) {
		this.initializeComponents();
		this.setupEventListeners();
	}

	/**
	 * Initialize all UI components
	 */
	private initializeComponents(): void {
		// Initialize components with empty data for now
		this.sidebar = new Sidebar(this.renderer, this.layout, []);
		this.contentWindow = new ContentWindow(this.renderer, this.layout);
		this.nowPlaying = new NowPlaying(this.renderer, this.layout, null);
		this.statusBar = new StatusBar(this.renderer, this.layout, null);
		this.statusSidebar = new StatusSidebar(this.renderer, this.layout);
		this.searchBar = new SearchBar(this.renderer, this.layout);
		this.commandPalette = new CommandPalette(this.renderer, this.layout);
	}

	/**
	 * Set up event listeners for UI updates
	 */
	private setupEventListeners(): void {
		// Listen to state changes and update UI
		this.eventBus.on("playback:stateChanged", () => {
			this.updatePlaybackUI();
		});

		this.eventBus.on("playback:trackChanged", () => {
			this.updateTrackUI();
		});

		this.eventBus.on("queue:updated", () => {
			this.updateQueueUI();
		});

		this.eventBus.on("trackList:updated", () => {
			this.updateTrackListUI();
		});

		this.eventBus.on("ui:focusChanged", () => {
			this.updateFocusUI();
		});

		this.eventBus.on("connection:statusChanged", () => {
			this.updateConnectionStatusUI();
		});
	}

	// ─────────────────────────────────────────────────────────────
	// Component Getters
	// ─────────────────────────────────────────────────────────────

	getSidebar(): Sidebar {
		return this.sidebar;
	}

	getContentWindow(): ContentWindow {
		return this.contentWindow;
	}

	getNowPlaying(): NowPlaying {
		return this.nowPlaying;
	}

	getStatusBar(): StatusBar {
		return this.statusBar;
	}

	getStatusSidebar(): StatusSidebar {
		return this.statusSidebar;
	}

	getSearchBar(): SearchBar {
		return this.searchBar;
	}

	getCommandPalette(): CommandPalette {
		return this.commandPalette;
	}

	// ─────────────────────────────────────────────────────────────
	// UI Update Methods
	// ─────────────────────────────────────────────────────────────

	/**
	 * Update playback UI (now playing, status bar)
	 */
	private updatePlaybackUI(): void {
		// Re-render components when playback state changes
		this.nowPlaying.render();
		this.statusBar.render();
	}

	/**
	 * Update track UI (now playing)
	 */
	private updateTrackUI(): void {
		// Re-render now playing when track changes
		this.nowPlaying.render();
	}

	/**
	 * Update queue UI
	 */
	private updateQueueUI(): void {
		// Re-render content window when queue changes
		this.contentWindow.render();
	}

	/**
	 * Update track list UI
	 */
	private updateTrackListUI(): void {
		// Re-render content window when track list changes
		this.contentWindow.render();
	}

	/**
	 * Update focus UI (highlight focused panel)
	 */
	private updateFocusUI(): void {
		// Re-render all panels when focus changes
		this.sidebar.render();
		this.contentWindow.render();
	}

	/**
	 * Update connection status UI
	 */
	private updateConnectionStatusUI(): void {
		// Re-render status sidebar when connection changes
		this.statusSidebar.render();
	}

	/**
	 * Set sidebar items
	 */
	setSidebarItems(items: MenuItem[]): void {
		this.stateManager.setSidebarItems(items);
		this.sidebar.render();
	}

	/**
	 * Update sidebar selection
	 */
	updateSidebarSelection(index: number): void {
		this.stateManager.setSelectedSidebarIndex(index);
		this.sidebar.render();
	}

	/**
	 * Set connection status
	 */
	setConnectionStatus(status: ConnectionStatus): void {
		this.statusSidebar.updateConnectionStatus(status);
	}

	/**
	 * Render all components
	 */
	render(): void {
		this.sidebar.render();
		this.contentWindow.render();
		this.nowPlaying.render();
		this.statusBar.render();
		this.statusSidebar.render();
		this.searchBar.render();

		// Command palette is rendered separately when shown
	}

	/**
	 * Update layout when terminal is resized
	 */
	updateLayout(layout: LayoutDimensions): void {
		this.layout = layout;

		this.sidebar.updateLayout(layout);
		this.contentWindow.updateLayout(layout);
		this.nowPlaying.updateLayout(layout);
		this.statusSidebar.updateLayout(layout);
		this.searchBar.updateLayout(layout);
		this.commandPalette.updateLayout(layout);

		this.eventBus.emit("ui:terminalResized", {
			width: layout.termWidth,
			height: layout.termHeight,
		});
	}

	/**
	 * Destroy all components
	 */
	destroy(): void {
		this.sidebar.destroy();
		this.contentWindow.destroy();
		this.nowPlaying.destroy();
		this.statusBar.destroy();
		this.statusSidebar.destroy();
		this.searchBar.destroy();
		this.commandPalette.destroy();
	}
}
