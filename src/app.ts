import { createCliRenderer, ConsolePosition } from "@opentui/core";
import type { CliRenderer, AppState, KeyEvent, LayoutDimensions, CurrentTrack, MenuItem } from "./types";
import type { NowPlayingInfo } from "./types/mpris";
import { Sidebar, NowPlaying, SearchBar, ContentWindow, StatusSidebar } from "./components";
import { cleanupTerminal, calculateLayout } from "./utils";
import { mockQueue } from "./data/mock";
import { KEY_BINDINGS } from "./config";
import { getMprisService, MprisService, getSpotifyApiService, SpotifyApiService } from "./services";

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
  private mpris!: MprisService;
  private spotifyApi!: SpotifyApiService;
  private updateInterval: Timer | null = null;
  
  // Components
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

  // Focus and input mode
  private focusedPanel: FocusPanel = "content";
  private inputMode: "normal" | "search" = "normal";
  
  // Navigation stack for back functionality
  private viewStack: string[] = ["playlists"];

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
    
    // Load playlists as default view
    await this.loadPlaylists();
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
    this.sidebar.onSelect = (item) => this.handleLibrarySelect(item);
    
    // Center top - Search bar
    this.searchBar = new SearchBar(this.renderer, this.layout);
    this.searchBar.onSearch = (query) => this.handleSearch(query);
    
    // Center main - Content window
    this.contentWindow = new ContentWindow(this.renderer, this.layout);
    this.contentWindow.onTrackSelect = (uri) => this.handlePlayTrack(uri);
    this.contentWindow.onPlaylistSelect = (id, name) => this.handlePlaylistSelect(id, name);
    
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

    // Set initial focus
    this.updateFocus();
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
      const message = error instanceof Error ? error.message : "Failed to load playlists";
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
    this.contentWindow.setLoading(true, "Loading saved tracks...");
    
    try {
      const response = await this.spotifyApi.getSavedTracks(50);
      const tracks = response.items.map(item => item.track);
      this.contentWindow.updateTracks(tracks, "Liked Songs");
      this.viewStack = ["songs"];
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load tracks";
      this.contentWindow.setStatus(`Error: ${message}`);
    }
  }

  /**
   * Handle playlist selection - load its tracks
   */
  private async handlePlaylistSelect(playlistId: string, playlistName: string): Promise<void> {
    this.contentWindow.setLoading(true, `Loading ${playlistName}...`);
    
    try {
      const response = await this.spotifyApi.getPlaylistTracks(playlistId, 100);
      const tracks = response.items
        .filter(item => item.track !== null)
        .map(item => item.track!);
      
      this.contentWindow.updatePlaylistTracks(tracks, playlistName);
      this.viewStack.push(`playlist:${playlistId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load playlist";
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
      setTimeout(() => this.updateFromMpris(), 500);
    } catch (error) {
      console.error("Failed to play track:", error);
    }
  }

  /**
   * Go back in navigation
   */
  private async goBack(): Promise<void> {
    if (this.viewStack.length <= 1) {
      // Already at root, just reload playlists
      await this.loadPlaylists();
      return;
    }

    this.viewStack.pop();
    const previousView = this.viewStack[this.viewStack.length - 1];

    if (previousView === "playlists") {
      await this.loadPlaylists();
    } else if (previousView === "songs") {
      await this.loadSavedTracks();
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
      case "equal": // + key
      case "plus":
        await this.mpris.volumeUp();
        break;
      case "minus":
        await this.mpris.volumeDown();
        break;
      case "right":
        await this.mpris.seekForward(5000);
        break;
      case "left":
        await this.mpris.seekBackward(5000);
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
