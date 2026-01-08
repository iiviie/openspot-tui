import { createCliRenderer, ConsolePosition } from "@opentui/core";
import type { CliRenderer, AppState, KeyEvent, LayoutDimensions } from "./types";
import { Sidebar, NowPlaying, Queue, StatusBar } from "./components";
import { cleanupTerminal, calculateLayout } from "./utils";
import { mockCurrentTrack, mockQueue } from "./data/mock";
import { KEY_BINDINGS } from "./config";

/**
 * Main application class
 * Handles initialization, rendering, and input handling
 */
export class App {
  private renderer!: CliRenderer;
  private layout!: LayoutDimensions;
  
  // Components
  private sidebar!: Sidebar;
  private nowPlaying!: NowPlaying;
  private queue!: Queue;
  private statusBar!: StatusBar;

  // Application state
  private state: AppState = {
    selectedMenuIndex: 0,
    currentTrack: mockCurrentTrack,
    queue: mockQueue,
    isPlaying: true,
  };

  /**
   * Initialize and start the application
   */
  async start(): Promise<void> {
    await this.initialize();
    this.setupComponents();
    this.render();
    this.setupInputHandlers();
    this.setupSignalHandlers();
    
    console.log("Use arrow keys or j/k to navigate, Enter to select, q to quit");
  }

  /**
   * Initialize the renderer
   */
  private async initialize(): Promise<void> {
    this.renderer = await createCliRenderer({
      consoleOptions: {
        position: ConsolePosition.BOTTOM,
        sizePercent: 20,
        startInDebugMode: false,
      },
    });

    this.layout = calculateLayout();
  }

  /**
   * Create and setup all UI components
   */
  private setupComponents(): void {
    this.sidebar = new Sidebar(this.renderer, this.layout);
    this.nowPlaying = new NowPlaying(this.renderer, this.layout, this.state.currentTrack);
    this.queue = new Queue(this.renderer, this.layout, this.state.queue);
    this.statusBar = new StatusBar(this.renderer, this.layout, this.state.currentTrack);
  }

  /**
   * Render all components
   */
  private render(): void {
    this.sidebar.render();
    this.nowPlaying.render();
    this.queue.render();
    this.statusBar.render();
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
    this.nowPlaying?.destroy();
    this.queue?.destroy();
    this.statusBar?.destroy();
  }
}
