import { createCliRenderer, ConsolePosition } from "@opentui/core";
import type { CliRenderer, AppState, KeyEvent, LayoutDimensions, CurrentTrack } from "./types";
import type { NowPlayingInfo } from "./types/mpris";
import { Sidebar, NowPlaying, SearchBar, ContentWindow, StatusSidebar } from "./components";
import { cleanupTerminal, calculateLayout } from "./utils";
import { mockQueue } from "./data/mock";
import { KEY_BINDINGS } from "./config";
import { getMprisService, MprisService, getSpotifyApiService, SpotifyApiService } from "./services";

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
 */
export class App {
  private renderer!: CliRenderer;
  private layout!: LayoutDimensions;
  private mpris!: MprisService;
  private spotifyApi!: SpotifyApiService;
  private updateInterval: Timer | null = null;
  
  // Components - new layout
  private sidebar!: Sidebar;
  private searchBar!: SearchBar;
  private contentWindow!: ContentWindow;
  private statusSidebar!: StatusSidebar;
  private nowPlaying!: NowPlaying;

  // Application state
  private state: AppState = {
    selectedMenuIndex: 0,
    currentTrack: null,
    queue: mockQueue,
    isPlaying: false,
  };

  // Status state
  private volume: number = 100;
  private shuffle: boolean = false;
  private repeat: string = "None";

  // Input mode
  private inputMode: "normal" | "search" | "results" = "normal";

  /**
   * Initialize and start the application
   */
  async start(): Promise<void> {
    await this.initializeMpris();
    this.initializeSpotifyApi();
    await this.initialize();
    this.setupComponents();
    this.render();
    this.setupInputHandlers();
    this.setupSignalHandlers();
    this.startUpdateLoop();
  }

  /**
   * Initialize MPRIS connection to spotifyd
   */
  private async initializeMpris(): Promise<void> {
    this.mpris = getMprisService();
    const connected = await this.mpris.connect();
    
    if (!connected) {
      console.log("Warning: Could not connect to spotifyd. Make sure it's running.");
      console.log("Run: spotifyd --no-daemon");
    }
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
    if (!this.mpris.isConnected()) return;

    const nowPlaying = await this.mpris.getNowPlaying();
    if (nowPlaying) {
      this.state.currentTrack = this.convertToCurrentTrack(nowPlaying);
      this.state.isPlaying = nowPlaying.isPlaying;
      this.volume = Math.round(nowPlaying.volume * 100);
      this.shuffle = nowPlaying.shuffle;
      this.repeat = nowPlaying.loopStatus;
    } else {
      this.state.currentTrack = null;
      this.state.isPlaying = false;
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
    
    // Center top - Search bar
    this.searchBar = new SearchBar(this.renderer, this.layout);
    this.searchBar.onSearch = (query) => this.handleSearch(query);
    
    // Center main - Content window
    this.contentWindow = new ContentWindow(this.renderer, this.layout);
    this.contentWindow.onTrackSelect = (uri) => this.handlePlayTrack(uri);
    
    // Right sidebar - Status
    this.statusSidebar = new StatusSidebar(
      this.renderer, 
      this.layout, 
      this.state.currentTrack,
      this.volume,
      this.shuffle,
      this.repeat
    );
    
    // Bottom bar - Now playing
    this.nowPlaying = new NowPlaying(this.renderer, this.layout, this.state.currentTrack);
  }

  /**
   * Handle search query
   */
  private async handleSearch(query: string): Promise<void> {
    this.contentWindow.setLoading(true);
    this.inputMode = "results";

    try {
      const tracks = await this.spotifyApi.searchTracks(query, 15);
      this.contentWindow.updateResults(tracks);
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
      setTimeout(() => this.updateFromMpris(), 500);
    } catch (error) {
      console.error("Failed to play track:", error);
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
  }

  /**
   * Start the update loop to refresh now playing info
   */
  private startUpdateLoop(): void {
    this.updateInterval = setInterval(async () => {
      await this.updateFromMpris();
      // Re-render components with new data
      this.nowPlaying.updateTrack(this.state.currentTrack);
      this.statusSidebar.updateStatus(
        this.state.currentTrack,
        this.volume,
        this.shuffle,
        this.repeat
      );
    }, 1000); // Update every second
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
    // Handle based on input mode
    switch (this.inputMode) {
      case "search":
        this.handleSearchModeInput(key);
        break;
      case "results":
        this.handleResultsModeInput(key);
        break;
      default:
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

    // Navigation in sidebar
    if ((KEY_BINDINGS.up as readonly string[]).includes(keyName)) {
      this.sidebar.selectPrevious();
      return;
    }

    if ((KEY_BINDINGS.down as readonly string[]).includes(keyName)) {
      this.sidebar.selectNext();
      return;
    }

    // Selection
    if ((KEY_BINDINGS.select as readonly string[]).includes(keyName)) {
      const selected = this.sidebar.getSelectedItem();
      console.log(`Selected: ${selected.label}`);
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
   * Handle input in results mode (navigating search results)
   */
  private handleResultsModeInput(key: KeyEvent): void {
    const keyName = key.name;

    // Quit
    if (key.ctrl && keyName === "c") {
      this.exit();
      return;
    }

    if ((KEY_BINDINGS.quit as readonly string[]).includes(keyName)) {
      this.exit();
      return;
    }

    // Escape to go back to normal mode
    if (keyName === "escape") {
      this.contentWindow.clearResults();
      this.searchBar.clear();
      this.inputMode = "normal";
      return;
    }

    // New search with /
    if (keyName === "/" || keyName === "slash") {
      this.inputMode = "search";
      this.searchBar.clear();
      this.searchBar.activate();
      return;
    }

    // Navigate results
    if ((KEY_BINDINGS.up as readonly string[]).includes(keyName)) {
      this.contentWindow.selectPrevious();
      return;
    }

    if ((KEY_BINDINGS.down as readonly string[]).includes(keyName)) {
      this.contentWindow.selectNext();
      return;
    }

    // Select and play
    if ((KEY_BINDINGS.select as readonly string[]).includes(keyName)) {
      this.contentWindow.selectCurrent();
      return;
    }

    // Playback controls still work in results mode
    this.handlePlaybackControls(keyName);
  }

  /**
   * Handle playback-related key presses
   */
  private async handlePlaybackControls(keyName: string): Promise<void> {
    if (!this.mpris.isConnected()) return;

    switch (keyName) {
      case "space":
        await this.mpris.playPause();
        break;
      case "n":
        await this.mpris.next();
        break;
      case "p":
        await this.mpris.previous();
        break;
      case "equal": // + key (shift not needed on some keyboards)
      case "plus":
        await this.mpris.volumeUp();
        break;
      case "minus":
        await this.mpris.volumeDown();
        break;
      case "right":
        await this.mpris.seekForward(5000); // 5 seconds
        break;
      case "left":
        await this.mpris.seekBackward(5000); // 5 seconds
        break;
      case "s":
        await this.mpris.toggleShuffle();
        break;
      case "r":
        await this.mpris.cycleLoopStatus();
        break;
    }

    // Update UI immediately after control
    await this.updateFromMpris();
  }

  /**
   * Setup process signal handlers for graceful shutdown
   */
  private setupSignalHandlers(): void {
    process.on("SIGINT", () => this.exit());
    process.on("SIGTERM", () => this.exit());
    process.on("exit", () => cleanupTerminal());
  }

  /**
   * Gracefully exit the application
   */
  private exit(): void {
    this.cleanup();
    cleanupTerminal();
    process.exit(0);
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    // Stop update loop
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }

    // Disconnect MPRIS
    this.mpris?.disconnect();

    // Try to stop/destroy renderer
    try {
      if (typeof (this.renderer as any).stop === "function") {
        (this.renderer as any).stop();
      }
      if (typeof (this.renderer as any).destroy === "function") {
        (this.renderer as any).destroy();
      }
    } catch {
      // Ignore errors during cleanup
    }

    // Destroy components
    this.sidebar?.destroy();
    this.searchBar?.destroy();
    this.contentWindow?.destroy();
    this.statusSidebar?.destroy();
    this.nowPlaying?.destroy();
  }
}
