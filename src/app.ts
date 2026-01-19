import { ConsolePosition, createCliRenderer } from "@opentui/core";
import {
	CommandPalette,
	ContentWindow,
	NowPlaying,
	SearchBar,
	Sidebar,
	StatusSidebar,
	ToastManager,
	getToastManager,
} from "./components";
import { PLAYBACK_UPDATE_DELAY_MS, UPDATE_INTERVAL_MS } from "./config";
import { mockQueue } from "./data/mock";
import {
	getSpotifyApiService,
	getSpotifydManager,
	type SpotifyApiService,
	type SpotifydManager,
} from "./services";
import { getConfigService } from "./services/ConfigService";
import {
	getPersistentCache,
	PersistentCacheKeys,
} from "./services/PersistentCacheService";
import type { AppState, CliRenderer, LayoutDimensions } from "./types";
import type { IMprisService } from "./types/mpris";
import { calculateLayout, getLogger } from "./utils";
import { getMprisService } from "./services";

// Import controllers
import {
	PlaybackController,
	MprisStateManager,
	NavigationController,
	ConnectionManager,
	AuthenticationController,
	InputHandler,
} from "./controllers";
import { AppLifecycle } from "./lifecycle";
import { buildCommands, type CommandCallbacks } from "./commands";

const logger = getLogger("App");

/**
 * Main application class - Now orchestrates controllers instead of handling everything directly
 * Reduced from 1,745 lines to ~400 lines by extracting controllers
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
export class App {
	private renderer!: CliRenderer;
	private layout!: LayoutDimensions;
	private mpris!: IMprisService;
	private spotifyApi!: SpotifyApiService;
	private spotifydManager!: SpotifydManager;
	private updateInterval: Timer | null = null;

	// Components
	private sidebar!: Sidebar;
	private searchBar!: SearchBar;
	private contentWindow!: ContentWindow;
	private statusSidebar!: StatusSidebar;
	private nowPlaying!: NowPlaying;
	private commandPalette!: CommandPalette;
	private toastManager!: ToastManager;

	// Controllers
	private playbackController!: PlaybackController;
	private mprisStateManager!: MprisStateManager;
	private navigationController!: NavigationController;
	private connectionManager!: ConnectionManager;
	private authController!: AuthenticationController;
	private inputHandler!: InputHandler;
	private lifecycle!: AppLifecycle;

	// Application state (will be moved to StateManager in Phase 4)
	private state: AppState = {
		selectedMenuIndex: 0,
		currentTrack: null,
		queue: mockQueue,
		isPlaying: false,
		position: 0,
		duration: 0,
		volume: 100,
		shuffle: false,
		repeat: "None",
		tracks: [],
		selectedTrackIndex: 0,
		focus: "sidebar",
		sidebarItems: [],
		selectedSidebarIndex: 0,
	};

	// Status state (shared with controllers)
	private volume: number = 100;
	private shuffle: boolean = false;
	private repeat: string = "None";

	/**
	 * Initialize and start the application
	 */
	async start(): Promise<void> {
		try {
			// Initialize core services
			await this.initializeServices();
			await this.initialize();

			// Setup UI components
			this.setupComponents();

			// Setup controllers (orchestration layer)
			this.setupControllers();

			// Render UI
			this.render();

			// Setup input handling
			this.setupInputHandlers();

			// Setup lifecycle management (signals, cleanup, exit)
			this.lifecycle.setupSignalHandlers();

			// Start update loop
			this.startUpdateLoop();

			// Load saved tracks (Songs) as default view
			await this.navigationController.loadSavedTracks();

			// Check auth status and show prompts if needed
			this.authController.checkAuthStatusAndPrompt();

			// Fetch and cache user profile if logged in
			await this.authController.fetchAndCacheUserProfile();

			// Auto-activate spotifyd as playback device
			await this.connectionManager.activateSpotifydDevice();
		} catch (error) {
			logger.error("Fatal error during startup", error);
			logger.always("\nPlease check:");
			logger.always("  1. spotifyd is installed and accessible");
			logger.always("  2. You are authenticated (bun run auth)");
			logger.always("  3. Your terminal supports the required features");
			this.lifecycle.cleanup();
			process.exit(1);
		}
	}

	/**
	 * Initialize core services (MPRIS, Spotify API, spotifyd)
	 */
	private async initializeServices(): Promise<void> {
		this.spotifydManager = getSpotifydManager();
		this.mpris = getMprisService();
		this.spotifyApi = getSpotifyApiService();

		// Initialize spotifyd and MPRIS via ConnectionManager (will be created in setupControllers)
		// For now, do it directly
		await this.initializeSpotifyd();
		await this.initializeMpris();
	}

	/**
	 * Initialize spotifyd (temporary - will move to ConnectionManager)
	 */
	private async initializeSpotifyd(): Promise<void> {
		const result = await this.spotifydManager.start();
		if (!result.success) {
			logger.warn("spotifyd not running");
			logger.always("   Press Ctrl+P → 'Authenticate Spotifyd' to set up\n");
		}
	}

	/**
	 * Initialize MPRIS (temporary - will move to ConnectionManager)
	 */
	private async initializeMpris(): Promise<void> {
		this.mpris
			.connect()
			.then((connected) => {
				if (!connected) {
					logger.warn("Could not connect to spotifyd. Make sure it's running.");
					logger.always("Run: spotifyd --no-daemon");
				} else {
					logger.info("MPRIS connection established");
				}
			})
			.catch((error) => {
				logger.error("MPRIS connection error:", error);
			});
	}

	/**
	 * Initialize the renderer
	 */
	private async initialize(): Promise<void> {
		this.renderer = await createCliRenderer({
			consoleOptions: {
				position: ConsolePosition.BOTTOM,
				sizePercent: 10,
				startInDebugMode: false,
			},
		});

		this.layout = calculateLayout();
	}

	/**
	 * Create and setup all UI components
	 */
	private setupComponents(): void {
		// Get username if logged in
		const configService = getConfigService();
		let username: string | null = null;
		if (configService.hasCredentials()) {
			const persistentCache = getPersistentCache();
			username =
				persistentCache.get<string>(
					PersistentCacheKeys.USER_PROFILE_DISPLAY_NAME,
				) || null;
		}

		// Left sidebar - Library navigation with username
		this.sidebar = new Sidebar(this.renderer, this.layout, undefined, username);

		// Center top - Search bar
		this.searchBar = new SearchBar(this.renderer, this.layout);

		// Center main - Content window
		this.contentWindow = new ContentWindow(this.renderer, this.layout);

		// Right sidebar - Status
		this.statusSidebar = new StatusSidebar(
			this.renderer,
			this.layout,
			this.state.currentTrack,
			this.volume,
			this.shuffle,
			this.repeat,
		);

		// Bottom bar - Now playing
		this.nowPlaying = new NowPlaying(
			this.renderer,
			this.layout,
			this.state.currentTrack,
		);

		// Command palette (Ctrl+P)
		this.commandPalette = new CommandPalette(this.renderer, this.layout);

		// Toast manager
		this.toastManager = getToastManager(this.renderer, this.layout);
	}

	/**
	 * Setup controllers - This is where the magic happens!
	 * Controllers handle all business logic, App just orchestrates
	 */
	private setupControllers(): void {
		// MPRIS State Manager - handles polling and state updates
		this.mprisStateManager = new MprisStateManager(
			this.mpris,
			this.state,
			this.statusSidebar,
			this.spotifyApi,
			(volume) => {
				this.volume = volume;
			},
			(shuffle) => {
				this.shuffle = shuffle;
			},
			(repeat) => {
				this.repeat = repeat;
			},
		);

		// Playback Controller - handles all playback controls
		this.playbackController = new PlaybackController(
			this.mpris,
			this.state,
			this.mprisStateManager,
			this.statusSidebar,
			this.nowPlaying,
			(action) => this.statusSidebar?.setLastAction(action),
			(volume) => {
				this.volume = volume;
			},
			(shuffle) => {
				this.shuffle = shuffle;
			},
			(repeat) => {
				this.repeat = repeat;
			},
		);

		// Connection Manager - handles spotifyd and MPRIS connection
		this.connectionManager = new ConnectionManager(
			this.mpris,
			this.spotifyApi,
			this.spotifydManager,
			this.statusSidebar,
			this.contentWindow,
			this.toastManager,
			() => this.render(),
		);

		// Navigation Controller - handles view navigation
		this.navigationController = new NavigationController(
			this.spotifyApi,
			this.contentWindow,
			() => this.focusContent(),
		);

		// Authentication Controller - handles login/logout
		this.authController = new AuthenticationController(
			this.spotifydManager,
			this.connectionManager,
			this.navigationController,
			this.contentWindow,
			this.sidebar,
			this.toastManager,
			() => this.render(),
		);

		// Input Handler - routes keyboard input
		this.inputHandler = new InputHandler(
			this.commandPalette,
			this.searchBar,
			this.sidebar,
			this.contentWindow,
			this.statusSidebar,
			this.toastManager,
			this.playbackController,
			this.navigationController,
			() => this.lifecycle.exit(),
			() => this.render(),
		);

		// App Lifecycle - handles signals, cleanup, exit
		this.lifecycle = new AppLifecycle(
			this.renderer,
			this.mpris,
			() => this.state.isPlaying,
			{
				sidebar: this.sidebar,
				searchBar: this.searchBar,
				contentWindow: this.contentWindow,
				statusSidebar: this.statusSidebar,
				nowPlaying: this.nowPlaying,
				commandPalette: this.commandPalette,
			},
			this.updateInterval,
			(layout) => this.handleLayoutChange(layout),
		);

		// Wire up component callbacks
		this.sidebar.onSelect = (item) =>
			this.navigationController.handleLibrarySelect(item);
		this.searchBar.onSearch = (query) =>
			this.navigationController.search(query);
		this.contentWindow.onTrackSelect = (uri) => this.handlePlayTrack(uri);
		this.contentWindow.onPlaylistSelect = (id, name) =>
			this.navigationController.loadPlaylistTracks(id, name);

		// Build commands with callbacks
		const callbacks = this.buildCommandCallbacks();
		const commands = buildCommands(callbacks);
		this.commandPalette.setCommands(commands);

		// Initial connection status update
		this.connectionManager.updateConnectionStatus();
	}

	/**
	 * Build command callbacks for command palette
	 */
	private buildCommandCallbacks(): CommandCallbacks {
		return {
			// Account
			loginToSpotify: async () => await this.authController.loginToSpotify(),
			logoutFromSpotify: async () =>
				await this.authController.logoutFromSpotify(),

			// Spotifyd
			authenticateSpotifyd: async () =>
				await this.authController.authenticateSpotifyd(),
			startSpotifyd: async () => {
				const result = await this.spotifydManager.start();
				this.connectionManager.updateConnectionStatus();
				this.contentWindow.setStatus(result.message);
			},
			stopSpotifyd: async () => {
				if (this.state.isPlaying) {
					await this.mpris?.pause();
				}
				this.spotifydManager.stop(true);
				this.connectionManager.updateConnectionStatus();
				this.toastManager.info(
					"Spotifyd Stopped",
					"Daemon has been stopped",
					3000,
				);
			},
			restartSpotifyd: async () => {
				this.contentWindow.setStatus("Restarting spotifyd...");
				if (this.state.isPlaying) {
					await this.mpris?.pause();
				}
				this.spotifydManager.stop(true);
				await new Promise((resolve) => setTimeout(resolve, 1000));
				const result = await this.spotifydManager.start();
				this.connectionManager.updateConnectionStatus();
				this.toastManager.info("Spotifyd Restarted", result.message, 3000);
			},
			activateSpotifyd: async () => {
				this.contentWindow.setStatus("Activating spotifyd...");
				const result = await this.spotifyApi.activateSpotifyd(false);
				this.contentWindow.setStatus(result.message);
				this.connectionManager.updateConnectionStatus();
			},

			// Playback
			handlePlaybackControl: async (keyName) =>
				await this.inputHandler.handlePlaybackControls(keyName),

			// Navigation
			activateSearch: () => this.inputHandler.activateSearch(),
			focusLibrary: () => this.inputHandler.focusLibrary(),
			focusContent: () => this.inputHandler.focusContent(),

			// Application
			quit: () => this.lifecycle.exit(),

			// State access
			getIsPlaying: () => this.state.isPlaying,
			updateConnectionStatus: () =>
				this.connectionManager.updateConnectionStatus(),
		};
	}

	/**
	 * Handle playing a track
	 */
	private async handlePlayTrack(trackUri: string): Promise<void> {
		try {
			await this.spotifyApi.playTrack(trackUri);
			// Update UI after short delay to let playback start
			setTimeout(
				() => this.mprisStateManager.updateFromMpris(),
				PLAYBACK_UPDATE_DELAY_MS,
			);
		} catch (error) {
			logger.error("Failed to play track", error);
		}
	}

	/**
	 * Focus content panel
	 */
	private focusContent(): void {
		this.inputHandler.focusContent();
	}

	/**
	 * Render all components
	 */
	private render(): void {
		this.sidebar.render();
		this.searchBar.render();
		this.contentWindow.render();
		this.statusSidebar.render();
		this.nowPlaying.render();
		// Render toasts last (on top of everything)
		this.toastManager.render();
	}

	/**
	 * Start the update loop to refresh now playing info
	 */
	private startUpdateLoop(): void {
		this.updateInterval = setInterval(async () => {
			try {
				await this.mprisStateManager.updateFromMpris();
				// Re-render components with new data
				this.nowPlaying.updateTrack(this.state.currentTrack);
				this.statusSidebar.updateStatus(
					this.state.currentTrack,
					this.volume,
					this.shuffle,
					this.repeat,
				);
				// Update connection status to reflect current state
				this.connectionManager.updateConnectionStatus();
				// Full render to update toasts
				this.render();
			} catch (error) {
				// Log error but keep interval running
				logger.error("Update loop error", error);
			}
		}, UPDATE_INTERVAL_MS); // Update every second
	}

	/**
	 * Setup keyboard input handlers
	 */
	private setupInputHandlers(): void {
		(this.renderer.keyInput as any).on("keypress", (key: any) => {
			this.inputHandler.handleKeyPress(key);
		});
	}

	/**
	 * Handle layout changes (terminal resize)
	 */
	private handleLayoutChange(layout: LayoutDimensions): void {
		this.layout = layout;

		// Update all components with new layout
		this.sidebar?.updateLayout(layout);
		this.searchBar?.updateLayout(layout);
		this.contentWindow?.updateLayout(layout);
		this.statusSidebar?.updateLayout(layout);
		this.nowPlaying?.updateLayout(layout);
		this.commandPalette?.updateLayout(layout);
	}
}
