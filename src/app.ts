import { createCliRenderer, ConsolePosition } from "@opentui/core";
import type { CliRenderer, AppState, KeyEvent, LayoutDimensions, CurrentTrack } from "./types";
import type { NowPlayingInfo } from "./types/mpris";
import { Sidebar, NowPlaying, SearchBar, ContentWindow, StatusSidebar } from "./components";
import { cleanupTerminal, calculateLayout } from "./utils";
import { mockQueue } from "./data/mock";
import { KEY_BINDINGS } from "./config";
import { getMprisService, MprisService } from "./services";

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

  /**
   * Initialize and start the application
   */
  async start(): Promise<void> {
    await this.initializeMpris();
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
    
    // Center main - Content window
    this.contentWindow = new ContentWindow(this.renderer, this.layout, this.state.queue);
    
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
   * Handle keyboard input
   */
  private handleKeyPress(key: KeyEvent): void {
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

    // Navigation
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
