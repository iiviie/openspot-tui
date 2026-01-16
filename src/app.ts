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
	type Command,
	type ConnectionStatus,
} from "./components";
import {
	KEY_BINDINGS,
	PLAYBACK_UPDATE_DELAY_MS,
	SEEK_STEP_MS,
	TRACK_END_THRESHOLD_MS,
	UPDATE_INTERVAL_MS,
} from "./config";
import { mockQueue } from "./data/mock";
import {
	getMprisService,
	getSpotifyApiService,
	getSpotifydManager,
	type SpotifyApiService,
	type SpotifydManager,
} from "./services";
import { shutdownCacheService } from "./services/CacheService";
import { getConfigService } from "./services/ConfigService";
import {
	getPersistentCache,
	PersistentCacheKeys,
} from "./services/PersistentCacheService";
import type {
	AppState,
	CliRenderer,
	CurrentTrack,
	KeyEvent,
	LayoutDimensions,
	MenuItem,
} from "./types";
import type { IMprisService, NowPlayingInfo } from "./types/mpris";
import type { SpotifyTrack } from "./types/spotify";
import { calculateLayout, cleanupTerminal, getLogger } from "./utils";

const logger = getLogger("App");

/**
 * Focus panel type
 */
type FocusPanel = "library" | "content";

/**
 * Main application class
 * Handles initialization, rendering, and input handling
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
 *
 * Navigation:
 * - h: Focus library (left)
 * - l: Focus content (right)
 * - j/k: Navigate within focused panel
 * - /: Search
 * - Enter: Select
 * - Escape: Go back
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

	// Application state
	private state: AppState = {
		selectedMenuIndex: 0,
		currentTrack: null,
		queue: mockQueue,
		isPlaying: false,
		position: 0,
		duration: 0,
		volume: 1.0,
		shuffle: false,
		repeat: "None",
		tracks: [],
		selectedTrackIndex: 0,
		focus: "sidebar",
		sidebarItems: [],
		selectedSidebarIndex: 0,
	};

	// Status state
	private volume: number = 100;
	private shuffle: boolean = false;
	private repeat: string = "None";

	// Focus and input mode
	private focusedPanel: FocusPanel = "content";
	private inputMode: "normal" | "search" = "normal";

	// Navigation stack for back functionality
	private viewStack: string[] = ["songs"];

	// Track change detection for syncing visual queue and queue playback
	private previousTrackTitle: string | null = null;
	private trackEndHandled: boolean = false;

	// Cooldown tracking for optimistic UI updates (prevents flickering)
	// When user triggers a control, we set a cooldown to ignore MPRIS updates for that property
	private readonly OPTIMISTIC_COOLDOWN_MS = 1500; // 1.5 seconds cooldown
	private playStateCooldownUntil: number = 0;
	private shuffleCooldownUntil: number = 0;
	private repeatCooldownUntil: number = 0;

	// Debounce tracking for rapid key presses (prevents D-Bus spam)
	private readonly DEBOUNCE_MS = 150; // Minimum ms between same-key presses
	private lastPlayPauseTime: number = 0;
	private lastShuffleTime: number = 0;
	private lastRepeatTime: number = 0;

	// Granular connection state tracking
	private spotifydState: import("./components").SpotifydState = "stopped";
	private mprisState: import("./components").MprisState = "disconnected";

	/**
	 * Initialize and start the application
	 */
	async start(): Promise<void> {
		try {
			// First, ensure spotifyd is running
			await this.initializeSpotifyd();

			await this.initializeMpris();
			this.initializeSpotifyApi();
			await this.initialize();
			this.setupComponents();
			this.render();
			this.setupInputHandlers();
			this.setupSignalHandlers();
			this.startUpdateLoop();

			// Load saved tracks (Songs) as default view
			await this.loadSavedTracks();

			// Check auth status and show prompts if needed
			this.checkAuthStatusAndPrompt();

			// Auto-activate spotifyd as playback device (so user doesn't need Spotify open)
			await this.activateSpotifydDevice();
		} catch (error) {
			logger.error("Fatal error during startup", error);
			logger.always("\nPlease check:");
			logger.always("  1. spotifyd is installed and accessible");
			logger.always("  2. You are authenticated (bun run auth)");
			logger.always("  3. Your terminal supports the required features");
			this.cleanup();
			process.exit(1);
		}
	}

	/**
	 * Initialize and start spotifyd if needed
	 */
	private async initializeSpotifyd(): Promise<void> {
		this.spotifydManager = getSpotifydManager();

		const result = await this.spotifydManager.start();

		if (!result.success) {
			// Warn but don't exit - user can authenticate later via Ctrl+P
			logger.warn("spotifyd not running");
			logger.always("   Press Ctrl+P → 'Authenticate Spotifyd' to set up\n");
			// Don't exit - allow app to run without spotifyd
		}
		// Note: Removed 1s wait - MPRIS connection has retry + TransferPlayback logic
	}

	/**
	 * Initialize MPRIS connection to spotifyd
	 * Connection happens in background to avoid blocking TUI startup
	 */
	private async initializeMpris(): Promise<void> {
		this.mpris = getMprisService();

		// Connect in background without blocking TUI startup
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
	 * Initialize Spotify Web API service
	 */
	private initializeSpotifyApi(): void {
		this.spotifyApi = getSpotifyApiService();
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

		// Get initial state from MPRIS
		await this.updateFromMpris();
	}

	/**
	 * Update state from MPRIS
	 */
	private async updateFromMpris(): Promise<void> {
		// Don't check isConnected() here - getNowPlaying() will auto-reconnect if needed
		const nowPlaying = await this.mpris.getNowPlaying();
		const now = Date.now();

		if (nowPlaying) {
			// Check cooldowns BEFORE creating the track object
			const inPlayCooldown = now <= this.playStateCooldownUntil;
			const inShuffleCooldown = now <= this.shuffleCooldownUntil;
			const inRepeatCooldown = now <= this.repeatCooldownUntil;

			// Preserve the current isPlaying state if in cooldown
			const preservedIsPlaying = this.state.isPlaying;

			// Convert track data from MPRIS
			this.state.currentTrack = this.convertToCurrentTrack(nowPlaying);

			// Apply cooldown logic - use cached state if in cooldown
			if (inPlayCooldown) {
				// Preserve our optimistic state
				this.state.isPlaying = preservedIsPlaying;
				if (this.state.currentTrack) {
					this.state.currentTrack.isPlaying = preservedIsPlaying;
				}
			} else {
				// Use MPRIS state
				this.state.isPlaying = nowPlaying.isPlaying;
				if (this.state.currentTrack) {
					this.state.currentTrack.isPlaying = nowPlaying.isPlaying;
				}
			}

			this.volume = Math.round(nowPlaying.volume * 100);

			// Only update shuffle if not in cooldown
			if (!inShuffleCooldown) {
				this.shuffle = nowPlaying.shuffle;
			}

			// Only update repeat if not in cooldown
			if (!inRepeatCooldown) {
				this.repeat = nowPlaying.loopStatus;
			}

			// Handle track changes and queue playback
			await this.handleTrackState(nowPlaying);
		} else {
			this.state.currentTrack = null;
			// Only update play state if not in cooldown
			if (now > this.playStateCooldownUntil) {
				this.state.isPlaying = false;
			}
		}
	}

	/**
	 * Handle track state changes - sync visual queue and trigger queue playback
	 */
	private async handleTrackState(nowPlaying: NowPlayingInfo): Promise<void> {
		// Skip if statusSidebar not yet initialized
		if (!this.statusSidebar) return;

		const currentTitle = nowPlaying.title;
		const positionMs = nowPlaying.positionMs;
		const durationMs = nowPlaying.durationMs;

		// Track changed - reset handled flag and sync visual queue
		if (currentTitle !== this.previousTrackTitle) {
			this.trackEndHandled = false;
			this.previousTrackTitle = currentTitle;

			// Check if the now playing track is the first item in our visual queue
			const queuePeek = this.statusSidebar.peekQueue();
			if (queuePeek && queuePeek.title === currentTitle) {
				// The queued track is now playing, remove it from visual queue
				this.statusSidebar.dequeue();
			}
		}

		// Skip queue playback logic if repeat track is enabled
		if (this.repeat === "Track") {
			return;
		}

		// Check if track is about to end (within last 2 seconds)
		const timeRemaining = durationMs - positionMs;
		const isAboutToEnd =
			timeRemaining > 0 &&
			timeRemaining < TRACK_END_THRESHOLD_MS &&
			durationMs > 0;

		// If track is about to end and we have queued items, play next from queue
		if (
			isAboutToEnd &&
			!this.trackEndHandled &&
			this.statusSidebar.hasQueuedItems()
		) {
			this.trackEndHandled = true;
			await this.playNextFromQueue();
		}
	}

	/**
	 * Play the next track from the queue
	 */
	private async playNextFromQueue(): Promise<void> {
		const nextTrack = this.statusSidebar.dequeue();
		if (nextTrack) {
			try {
				await this.spotifyApi.playTrack(nextTrack.uri);
			} catch (_error) {
				// Failed to play, re-add to queue
				this.statusSidebar.addToQueue(nextTrack);
			}
		}
	}

	/**
	 * Convert MPRIS NowPlayingInfo to CurrentTrack
	 */
	private convertToCurrentTrack(info: NowPlayingInfo): CurrentTrack {
		return {
			title: info.title,
			artist: info.artist,
			album: info.album,
			currentTime: this.formatTime(info.positionMs),
			totalTime: this.formatTime(info.durationMs),
			progress: info.durationMs > 0 ? info.positionMs / info.durationMs : 0,
			isPlaying: info.isPlaying,
		};
	}

	/**
	 * Format milliseconds to mm:ss
	 */
	private formatTime(ms: number): string {
		const totalSeconds = Math.floor(ms / 1000);
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;
		return `${minutes}:${seconds.toString().padStart(2, "0")}`;
	}

	/**
	 * Create and setup all UI components
	 */
	private setupComponents(): void {
		// Left sidebar - Library navigation
		this.sidebar = new Sidebar(this.renderer, this.layout);
		this.sidebar.onSelect = (item) => this.handleLibrarySelect(item);

		// Center top - Search bar
		this.searchBar = new SearchBar(this.renderer, this.layout);
		this.searchBar.onSearch = (query) => this.handleSearch(query);

		// Center main - Content window
		this.contentWindow = new ContentWindow(this.renderer, this.layout);
		this.contentWindow.onTrackSelect = (uri) => this.handlePlayTrack(uri);
		this.contentWindow.onPlaylistSelect = (id, name) =>
			this.handlePlaylistSelect(id, name);

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
		this.commandPalette.setCommands(this.buildCommands());

		// Toast manager
		this.toastManager = getToastManager(this.renderer, this.layout);

		// Set initial focus
		this.updateFocus();

		// Initial connection status update
		this.updateConnectionStatus();
	}

	/**
	 * Build the list of commands for the command palette
	 */
	private buildCommands(): Command[] {
		return [
			// Account section
			{
				id: "api-login",
				label: "Login to Spotify",
				category: "Account",
				action: async () => {
					await this.loginToSpotify();
				},
			},
			{
				id: "api-logout",
				label: "Logout",
				category: "Account",
				action: async () => {
					await this.logoutFromSpotify();
				},
			},

			// Spotifyd section
			{
				id: "spotifyd-authenticate",
				label: "Authenticate Spotifyd",
				category: "Spotifyd",
				action: async () => {
					await this.authenticateSpotifyd();
				},
			},
			{
				id: "spotifyd-start",
				label: "Start Spotifyd",
				category: "Spotifyd",
				action: async () => {
					const result = await this.spotifydManager.start();
					this.updateConnectionStatus();
					this.contentWindow.setStatus(result.message);
				},
			},
			{
				id: "spotifyd-stop",
				label: "Stop Spotifyd",
				category: "Spotifyd",
				action: () => {
					this.spotifydManager.stop();
					this.updateConnectionStatus();
					this.contentWindow.setStatus("Spotifyd stopped");
				},
			},
			{
				id: "spotifyd-activate",
				label: "Activate as Playback Device",
				category: "Spotifyd",
				action: async () => {
					this.contentWindow.setStatus("Activating spotifyd...");
					const result = await this.spotifyApi.activateSpotifyd(false);
					this.contentWindow.setStatus(result.message);
					this.updateConnectionStatus();
				},
			},

			// Playback section
			{
				id: "playback-play-pause",
				label: "Play / Pause",
				shortcut: "space",
				category: "Playback",
				action: async () => {
					await this.handlePlaybackControls("space");
				},
			},
			{
				id: "playback-next",
				label: "Next Track",
				shortcut: "n",
				category: "Playback",
				action: async () => {
					await this.handlePlaybackControls("n");
				},
			},
			{
				id: "playback-previous",
				label: "Previous Track",
				shortcut: "p",
				category: "Playback",
				action: async () => {
					await this.handlePlaybackControls("p");
				},
			},
			{
				id: "playback-shuffle",
				label: "Toggle Shuffle",
				shortcut: "s",
				category: "Playback",
				action: async () => {
					await this.handlePlaybackControls("s");
				},
			},
			{
				id: "playback-repeat",
				label: "Cycle Repeat Mode",
				shortcut: "r",
				category: "Playback",
				action: async () => {
					await this.handlePlaybackControls("r");
				},
			},

			// Navigation section
			{
				id: "nav-search",
				label: "Search",
				shortcut: "/",
				category: "Navigation",
				action: () => {
					this.inputMode = "search";
					this.searchBar.activate();
				},
			},
			{
				id: "nav-library",
				label: "Go to Library",
				shortcut: "h",
				category: "Navigation",
				action: () => {
					this.focusedPanel = "library";
					this.updateFocus();
				},
			},
			{
				id: "nav-content",
				label: "Go to Content",
				shortcut: "l",
				category: "Navigation",
				action: () => {
					this.focusedPanel = "content";
					this.updateFocus();
				},
			},

			// Application section
			{
				id: "app-quit",
				label: "Quit",
				shortcut: "q",
				category: "Application",
				action: () => {
					this.cleanup();
				},
			},
		];
	}

	/**
	 * Authenticate spotifyd via OAuth
	 */
	private async authenticateSpotifyd(): Promise<void> {
		// Force re-render to show status updates
		this.render();

		// Set authenticating state
		this.spotifydState = "authenticating";
		this.updateConnectionStatus();

		// Check if spotifyd is running - we may need to stop it to avoid port conflicts
		const wasRunning = this.spotifydManager.isManagedByUs();
		if (wasRunning) {
			this.spotifydState = "stopping";
			this.updateConnectionStatus();
			this.spotifydManager.stop();
			// Wait for it to fully stop
			await new Promise((resolve) => setTimeout(resolve, 500));
		}

		this.spotifydState = "authenticating";
		this.updateConnectionStatus();
		this.render();

		const result = await this.spotifydManager.authenticate();

		if (result.success) {
			this.toastManager.success("Spotifyd Auth", "Starting spotifyd...", 2000);
			this.spotifydState = "starting";
			this.updateConnectionStatus();
			this.render();

			// Restart spotifyd with new credentials
			const startResult = await this.spotifydManager.start();
			if (startResult.success) {
				this.spotifydState = "running";
				this.mprisState = "connecting";
				this.updateConnectionStatus();

				// Reconnect MPRIS with retry logic
				const connected = await this.reconnectMprisWithRetry(5);
				if (connected) {
					this.mprisState = "connected";
					this.toastManager.success("Connected", "Spotifyd ready", 2000);
				} else {
					this.mprisState = "disconnected";
					this.toastManager.warning(
						"MPRIS Failed",
						"Try manual connection",
						4000,
					);
				}
				this.updateConnectionStatus();
				this.render();
			} else {
				this.spotifydState = "stopped";
				this.updateConnectionStatus();
				this.toastManager.error("Restart Failed", startResult.message, 4000);
				this.render();
			}
		} else {
			this.spotifydState = wasRunning ? "stopped" : "not_authenticated";
			this.updateConnectionStatus();
			this.toastManager.error("Auth Failed", result.message, 4000);
			this.render();
			// Try to restart spotifyd if we stopped it
			if (wasRunning) {
				this.spotifydState = "starting";
				this.updateConnectionStatus();
				await this.spotifydManager.start();
				this.spotifydState = "running";
				this.updateConnectionStatus();
			}
		}
	}

	/**
	 * Login to Spotify Web API
	 */
	private async loginToSpotify(): Promise<void> {
		try {
			const authService = await import("./services/AuthService").then((m) =>
				m.getAuthService(),
			);

			await authService.login();

			this.toastManager.success("Logged In", "Loading library...", 2000);
			this.render();

			// Reload library data
			await this.loadSavedTracks();

			// Update connection status to show logged in
			this.updateConnectionStatus();
		} catch (error) {
			const message = error instanceof Error ? error.message : "Login failed";
			this.toastManager.error("Login Failed", message, 4000);
			this.render();
			logger.error("Login failed:", error);
		}
	}

	/**
	 * Reconnect to MPRIS with retry logic and exponential backoff
	 * @param maxAttempts - Maximum number of connection attempts
	 * @returns true if connected, false if all retries failed
	 */
	private async reconnectMprisWithRetry(maxAttempts = 5): Promise<boolean> {
		const delays = [500, 1000, 2000, 3000, 4000]; // Exponential backoff delays

		for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			this.mprisState = attempt === 1 ? "connecting" : "reconnecting";
			this.updateConnectionStatus();
			this.contentWindow.setStatus(
				`Connecting to MPRIS (attempt ${attempt}/${maxAttempts})...`,
			);

			const connected = await this.mpris.connect();
			if (connected) {
				this.mprisState = "connected";
				this.updateConnectionStatus();
				this.contentWindow.setStatus("MPRIS connected!");
				return true;
			}

			// Wait before retrying (except on last attempt)
			if (attempt < maxAttempts) {
				const delay = delays[attempt - 1] || 3000;
				await new Promise((resolve) => setTimeout(resolve, delay));
			}
		}

		// All retries exhausted
		this.mprisState = "disconnected";
		this.updateConnectionStatus();
		this.contentWindow.setStatus("MPRIS connection failed after all retries");
		return false;
	}

	/**
	 * Logout from Spotify
	 * Clears credentials and all caches
	 */
	private async logoutFromSpotify(): Promise<void> {
		try {
			const configService = getConfigService();
			const persistentCache = getPersistentCache();

			// Clear credentials
			configService.clearCredentials();

			// Clear all caches
			const cacheService = await import("./services/CacheService").then((m) =>
				m.getCacheService(),
			);
			cacheService.clear();
			persistentCache.clearAll();

			// Clear UI state
			this.contentWindow.updateTracks([], "");
			this.viewStack = [];

			// Show success toast
			this.toastManager.success("Logged Out", "Credentials cleared", 2000);
			this.render();

			// Update connection status
			this.updateConnectionStatus();

			logger.info("Logged out successfully");
		} catch (error) {
			const message = error instanceof Error ? error.message : "Logout failed";
			this.toastManager.error("Logout Error", message, 4000);
			this.render();
			logger.error("Logout failed:", error);
		}
	}

	/**
	 * Activate spotifyd as the Spotify Connect playback device
	 * This allows playback without needing the Spotify app open
	 * Retries a few times since spotifyd needs time to register with Spotify
	 */
	private async activateSpotifydDevice(): Promise<void> {
		const maxRetries = 5;
		const retryDelayMs = 2000; // 2 seconds between retries

		for (let attempt = 1; attempt <= maxRetries; attempt++) {
			const result = await this.spotifyApi.activateSpotifyd(false);

			if (result.success) {
				this.updateConnectionStatus();
				return;
			}

			// If device not found and we have retries left, wait and try again
			if (attempt < maxRetries) {
				await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
			}
		}

		// All retries exhausted - silently fail, user can manually activate via Ctrl+P
		this.updateConnectionStatus();
	}

	/**
	 * Update connection status in the status sidebar
	 */
	private updateConnectionStatus(): void {
		const spotifydStatus = this.spotifydManager.getStatus();

		// Determine which backend is being used
		const useNative = process.env.SPOTIFY_TUI_USE_NATIVE !== "0";

		// Determine spotifyd granular state (unless manually set during operations)
		if (
			this.spotifydState !== "starting" &&
			this.spotifydState !== "stopping" &&
			this.spotifydState !== "authenticating"
		) {
			if (!spotifydStatus.installed) {
				this.spotifydState = "not_installed";
			} else if (!spotifydStatus.authenticated) {
				this.spotifydState = "not_authenticated";
			} else if (spotifydStatus.running) {
				this.spotifydState = "running";
			} else {
				this.spotifydState = "stopped";
			}
		}

		// Determine MPRIS granular state (unless manually set during operations)
		if (
			this.mprisState !== "connecting" &&
			this.mprisState !== "reconnecting"
		) {
			if (this.mpris?.isConnected()) {
				this.mprisState = "connected";
			} else {
				this.mprisState = "disconnected";
			}
		}

		// Check if Web API is authenticated
		const configService = getConfigService();
		const webApiLoggedIn = configService.hasCredentials();

		const connectionStatus: ConnectionStatus = {
			spotifydInstalled: spotifydStatus.installed,
			spotifydRunning: spotifydStatus.running,
			spotifydAuthenticated: spotifydStatus.authenticated,
			spotifydState: this.spotifydState,
			mprisConnected: this.mpris?.isConnected() ?? false,
			mprisState: this.mprisState,
			mprisBackend: useNative ? "native" : "typescript",
			webApiLoggedIn,
		};

		this.statusSidebar.updateConnectionStatus(connectionStatus);
	}

	/**
	 * Show action feedback in the status sidebar
	 */
	private showActionFeedback(action: string): void {
		this.statusSidebar?.setLastAction(action);
	}

	/**
	 * Check authentication status and show prompts if needed
	 */
	private checkAuthStatusAndPrompt(): void {
		const configService = getConfigService();
		const spotifydStatus = this.spotifydManager.getStatus();

		const webApiLoggedIn = configService.hasCredentials();
		const spotifydAuth = spotifydStatus.authenticated;

		// If neither is authenticated, prompt for spotifyd first
		if (!webApiLoggedIn && !spotifydAuth) {
			setTimeout(() => {
				this.toastManager.info(
					"Setup Required",
					"Press Ctrl+P to authenticate",
					6000,
				);
				this.render();
			}, 2000);
		}
		// If spotifyd is auth'd but Web API isn't
		else if (!webApiLoggedIn && spotifydAuth) {
			setTimeout(() => {
				this.toastManager.info(
					"Login Required",
					"Press Ctrl+P to login to Spotify",
					6000,
				);
				this.render();
			}, 2000);
		}
		// If Web API is auth'd but spotifyd isn't
		else if (webApiLoggedIn && !spotifydAuth) {
			setTimeout(() => {
				this.toastManager.info(
					"Spotifyd Setup",
					"Press Ctrl+P to authenticate spotifyd",
					6000,
				);
				this.render();
			}, 2000);
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
	 * Load user's playlists
	 */
	private async loadPlaylists(): Promise<void> {
		this.contentWindow.setLoading(true, "Loading playlists...");

		try {
			const response = await this.spotifyApi.getPlaylists(50);
			this.contentWindow.updatePlaylists(response.items);
			this.viewStack = ["playlists"];
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to load playlists";
			this.contentWindow.setStatus(`Error: ${message}`);
		}
	}

	/**
	 * Handle library menu selection
	 */
	private async handleLibrarySelect(item: MenuItem): Promise<void> {
		switch (item.id) {
			case "playlists":
				await this.loadPlaylists();
				break;
			case "songs":
				await this.loadSavedTracks();
				break;
			case "albums":
				// TODO: Implement albums
				this.contentWindow.setStatus("Albums - Coming soon");
				break;
			case "artists":
				// TODO: Implement artists
				this.contentWindow.setStatus("Artists - Coming soon");
				break;
		}

		// Move focus to content after selecting from library
		this.focusedPanel = "content";
		this.updateFocus();
	}

	/**
	 * Load saved tracks
	 */
	private async loadSavedTracks(): Promise<void> {
		const configService = getConfigService();
		const persistentCache = getPersistentCache();
		const cacheKey = PersistentCacheKeys.savedTracks();

		// Check if we have valid credentials before loading cache
		if (!configService.hasCredentials()) {
			logger.info("No credentials found - skipping saved tracks load");
			this.contentWindow.setStatus(
				"Not logged in - Press Ctrl+P → 'Login to Spotify'",
			);

			// Clear any stale cache
			persistentCache.clearAll();
			return;
		}

		// Try to load from disk cache first (instant startup!)
		const cachedTracks = persistentCache.get<SpotifyTrack[]>(cacheKey);
		if (cachedTracks && cachedTracks.length > 0) {
			const age = persistentCache.getAge(cacheKey);
			const ageMinutes = age ? Math.floor(age / 60000) : 0;

			// Show cached data immediately
			this.contentWindow.updateTracks(cachedTracks, "Liked Songs");
			this.viewStack = ["songs"];

			logger.info(
				`Loaded ${cachedTracks.length} tracks from cache (${ageMinutes}m old)`,
			);

			// Refresh in background if cache is older than 5 minutes
			if (!age || age > 5 * 60 * 1000) {
				this.refreshSavedTracksInBackground();
			}
			return;
		}

		// No cache - show loading and fetch
		this.contentWindow.setLoading(true, "Loading saved tracks...");

		try {
			const response = await this.spotifyApi.getSavedTracks(50);
			const tracks = response.items.map((item) => item.track);

			// Update UI
			this.contentWindow.updateTracks(tracks, "Liked Songs");
			this.viewStack = ["songs"];

			// Save to persistent cache for next startup
			persistentCache.set(cacheKey, tracks);

			logger.info(`Loaded ${tracks.length} tracks from API`);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to load tracks";
			this.contentWindow.setStatus(`Error: ${message}`);
		}
	}

	/**
	 * Refresh saved tracks in background (stale-while-revalidate)
	 */
	private async refreshSavedTracksInBackground(): Promise<void> {
		try {
			const response = await this.spotifyApi.getSavedTracks(50);
			const tracks = response.items.map((item) => item.track);

			// Update UI quietly (no loading indicator)
			this.contentWindow.updateTracks(tracks, "Liked Songs");

			// Update persistent cache
			getPersistentCache().set(PersistentCacheKeys.savedTracks(), tracks);

			logger.debug("Refreshed saved tracks in background");
		} catch (error) {
			// Silent failure - user already sees cached data
			logger.warn("Background refresh failed:", error);
		}
	}

	/**
	 * Handle playlist selection - load its tracks
	 */
	private async handlePlaylistSelect(
		playlistId: string,
		playlistName: string,
	): Promise<void> {
		this.contentWindow.setLoading(true, `Loading ${playlistName}...`);

		try {
			const response = await this.spotifyApi.getPlaylistTracks(playlistId, 100);
			const tracks = response.items
				.filter((item): item is { track: SpotifyTrack } => item.track !== null)
				.map((item) => item.track);

			this.contentWindow.updatePlaylistTracks(tracks, playlistName);
			this.viewStack.push(`playlist:${playlistId}`);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to load playlist";
			this.contentWindow.setStatus(`Error: ${message}`);
		}
	}

	/**
	 * Handle search query
	 */
	private async handleSearch(query: string): Promise<void> {
		this.contentWindow.setLoading(true, "Searching...");
		this.focusedPanel = "content";
		this.updateFocus();

		try {
			const tracks = await this.spotifyApi.searchTracks(query, 20);
			this.contentWindow.updateSearchResults(tracks);
			this.viewStack.push(`search:${query}`);
		} catch (error) {
			const message = error instanceof Error ? error.message : "Search failed";
			this.contentWindow.setStatus(`Error: ${message}`);
		}
	}

	/**
	 * Handle playing a track
	 */
	private async handlePlayTrack(trackUri: string): Promise<void> {
		try {
			await this.spotifyApi.playTrack(trackUri);
			// Update UI after short delay to let playback start
			setTimeout(() => this.updateFromMpris(), PLAYBACK_UPDATE_DELAY_MS);
		} catch (error) {
			logger.error("Failed to play track", error);
		}
	}

	/**
	 * Add selected track to the queue (both Spotify's native queue and visual queue)
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
			await this.spotifyApi.addToQueue(selected.uri);
		} catch (_error) {
			// Spotify API failed (likely no active playback)
			// Our custom queue logic will handle playback instead
		}
	}

	/**
	 * Go back in navigation
	 */
	private async goBack(): Promise<void> {
		if (this.viewStack.length <= 1) {
			// Already at root, just reload songs
			await this.loadSavedTracks();
			return;
		}

		this.viewStack.pop();
		const previousView = this.viewStack[this.viewStack.length - 1];

		if (previousView === "songs") {
			await this.loadSavedTracks();
		} else if (previousView === "playlists") {
			await this.loadPlaylists();
		} else if (previousView.startsWith("playlist:")) {
			// Go back to playlists list instead of previous playlist
			await this.loadPlaylists();
			this.viewStack = ["playlists"];
		}
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
				await this.updateFromMpris();
				// Re-render components with new data
				this.nowPlaying.updateTrack(this.state.currentTrack);
				this.statusSidebar.updateStatus(
					this.state.currentTrack,
					this.volume,
					this.shuffle,
					this.repeat,
				);
				// Update connection status to reflect current state
				this.updateConnectionStatus();
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
		(this.renderer.keyInput as any).on("keypress", (key: KeyEvent) => {
			this.handleKeyPress(key);
		});
	}

	/**
	 * Handle keyboard input based on current mode
	 */
	private handleKeyPress(key: KeyEvent): void {
		// Check if toast manager handles the input first (highest priority)
		if (this.toastManager.handleInput(key.name)) {
			this.render(); // Re-render if toast handled input
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
	private handleNormalModeInput(key: KeyEvent): void {
		const keyName = key.name;

		// Quit
		if (key.ctrl && keyName === "c") {
			this.exit();
			return;
		}

		// Command palette (Ctrl+P)
		if (key.ctrl && keyName === "p") {
			this.commandPalette.show();
			return;
		}

		if ((KEY_BINDINGS.quit as readonly string[]).includes(keyName)) {
			this.exit();
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
			this.goBack();
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
	private handleSearchModeInput(key: KeyEvent): void {
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
	private async handlePlaybackControls(keyName: string): Promise<void> {
		// Try to ensure MPRIS connection (auto-reconnect if needed)
		const connected = await this.mpris.ensureConnection();
		if (!connected) return;

		// Track if we need a full MPRIS update (for most controls)
		// Shuffle/repeat use optimistic updates and skip the full refresh
		let needsFullUpdate = true;

		switch (keyName) {
			case "space": {
				// Debounce: ignore rapid presses within DEBOUNCE_MS
				const now = Date.now();
				if (now - this.lastPlayPauseTime < this.DEBOUNCE_MS) {
					needsFullUpdate = false;
					break;
				}
				this.lastPlayPauseTime = now;

				// OPTIMISTIC UPDATE: Update UI immediately BEFORE D-Bus call
				this.state.isPlaying = !this.state.isPlaying;
				if (this.state.currentTrack) {
					this.state.currentTrack.isPlaying = this.state.isPlaying;
				}
				this.playStateCooldownUntil = now + this.OPTIMISTIC_COOLDOWN_MS;
				this.nowPlaying.updateTrack(this.state.currentTrack);
				this.statusSidebar.updateStatus(
					this.state.currentTrack,
					this.volume,
					this.shuffle,
					this.repeat,
				);

				// Show action feedback
				this.showActionFeedback(this.state.isPlaying ? "Playing" : "Paused");

				// Fire-and-forget: Send D-Bus command without blocking UI
				this.mpris.playPause().catch(() => {
					// If D-Bus fails, revert the optimistic update
					this.state.isPlaying = !this.state.isPlaying;
					if (this.state.currentTrack) {
						this.state.currentTrack.isPlaying = this.state.isPlaying;
					}
					this.showActionFeedback("Command failed");
				});

				needsFullUpdate = false;
				break;
			}
			case "n":
				// Play from queue if available, otherwise use MPRIS next
				this.showActionFeedback("Next track");
				if (this.statusSidebar?.hasQueuedItems()) {
					await this.playNextFromQueue();
				} else {
					await this.mpris.next();
				}
				break;
			case "p":
				this.showActionFeedback("Previous track");
				await this.mpris.previous();
				break;
			case "equal": // + key
			case "plus":
				this.showActionFeedback("Volume up");
				await this.mpris.volumeUp();
				break;
			case "minus":
				this.showActionFeedback("Volume down");
				await this.mpris.volumeDown();
				break;
			case "right":
				this.showActionFeedback("Seek forward");
				await this.mpris.seekForward(SEEK_STEP_MS);
				break;
			case "left":
				this.showActionFeedback("Seek backward");
				await this.mpris.seekBackward(SEEK_STEP_MS);
				break;
			case "s": {
				// Debounce: ignore rapid presses
				const now = Date.now();
				if (now - this.lastShuffleTime < this.DEBOUNCE_MS) {
					needsFullUpdate = false;
					break;
				}
				this.lastShuffleTime = now;

				// OPTIMISTIC UPDATE: Update UI immediately BEFORE D-Bus call
				const previousShuffle = this.shuffle;
				this.shuffle = !this.shuffle;
				this.shuffleCooldownUntil = now + this.OPTIMISTIC_COOLDOWN_MS;
				this.statusSidebar.updateStatus(
					this.state.currentTrack,
					this.volume,
					this.shuffle,
					this.repeat,
				);

				// Show action feedback
				this.showActionFeedback(this.shuffle ? "Shuffle ON" : "Shuffle OFF");

				// Fire-and-forget: Send D-Bus command without blocking UI
				this.mpris.toggleShuffle(previousShuffle).catch(() => {
					// If D-Bus fails, revert
					this.shuffle = previousShuffle;
					this.showActionFeedback("Command failed");
				});

				needsFullUpdate = false;
				break;
			}
			case "r": {
				// Debounce: ignore rapid presses
				const now = Date.now();
				if (now - this.lastRepeatTime < this.DEBOUNCE_MS) {
					needsFullUpdate = false;
					break;
				}
				this.lastRepeatTime = now;

				// OPTIMISTIC UPDATE: Update UI immediately BEFORE D-Bus call
				const previousRepeat = this.repeat;
				const nextRepeat =
					this.repeat === "None"
						? "Playlist"
						: this.repeat === "Playlist"
							? "Track"
							: "None";
				this.repeat = nextRepeat;
				this.repeatCooldownUntil = now + this.OPTIMISTIC_COOLDOWN_MS;
				this.statusSidebar.updateStatus(
					this.state.currentTrack,
					this.volume,
					this.shuffle,
					this.repeat,
				);

				// Show action feedback
				this.showActionFeedback(`Repeat: ${nextRepeat}`);

				// Fire-and-forget: Send D-Bus command without blocking UI
				this.mpris.cycleLoopStatus(previousRepeat as any).catch(() => {
					// If D-Bus fails, revert
					this.repeat = previousRepeat;
					this.showActionFeedback("Command failed");
				});

				needsFullUpdate = false;
				break;
			}
		}

		// Update UI immediately after control (skip for optimistic updates)
		if (needsFullUpdate) {
			await this.updateFromMpris();
		}
	}

	/**
	 * Setup process signal handlers for graceful shutdown
	 */
	private setupSignalHandlers(): void {
		// Use once() to prevent multiple handlers
		process.once("SIGINT", () => {
			this.exit();
		});
		process.once("SIGTERM", () => {
			this.exit();
		});
		process.once("exit", () => {
			cleanupTerminal();
		});

		// Listen for terminal resize events
		process.stdout.on("resize", () => this.handleResize());
	}

	/**
	 * Handle terminal resize event
	 */
	private handleResize(): void {
		// Recalculate layout based on new terminal size
		this.layout = calculateLayout();

		// Update all components with new layout
		this.sidebar?.updateLayout(this.layout);
		this.searchBar?.updateLayout(this.layout);
		this.contentWindow?.updateLayout(this.layout);
		this.statusSidebar?.updateLayout(this.layout);
		this.nowPlaying?.updateLayout(this.layout);
		this.commandPalette?.updateLayout(this.layout);
	}

	/**
	 * Gracefully exit the application
	 */
	private exit(): void {
		// Cleanup synchronously
		this.cleanup();
		cleanupTerminal();

		// Force exit immediately - don't wait for async operations
		process.exit(0);
	}

	/**
	 * Cleanup resources
	 */
	private cleanup(): void {
		logger.debug("Cleaning up resources...");

		// Stop update loop
		if (this.updateInterval) {
			clearInterval(this.updateInterval);
			this.updateInterval = null;
		}

		// Disconnect MPRIS (synchronous)
		try {
			this.mpris?.disconnect();
		} catch (e) {
			logger.warn("MPRIS disconnect failed:", e);
		}

		// Stop spotifyd - force kill immediately for quick exit
		try {
			if (this.spotifydManager?.isManagedByUs()) {
				this.spotifydManager.stop(true); // Force kill immediately
			} else {
				this.spotifydManager?.stop();
			}
		} catch (e) {
			logger.warn("Spotifyd stop failed:", e);
		}

		// Shutdown cache service (clears intervals)
		try {
			shutdownCacheService();
		} catch (e) {
			logger.warn("Cache shutdown failed:", e);
		}

		// Try to stop/destroy renderer
		try {
			if (typeof (this.renderer as any).stop === "function") {
				(this.renderer as any).stop();
			}
			if (typeof (this.renderer as any).destroy === "function") {
				(this.renderer as any).destroy();
			}
		} catch (e) {
			// Ignore errors during cleanup
		}

		// Destroy components
		try {
			this.sidebar?.destroy();
			this.searchBar?.destroy();
			this.contentWindow?.destroy();
			this.statusSidebar?.destroy();
			this.nowPlaying?.destroy();
			this.commandPalette?.destroy();
		} catch (e) {
			// Ignore errors during component cleanup
		}

		logger.debug("Cleanup complete");
	}
}
