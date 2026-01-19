import type { IAppLifecycle } from "../interfaces";
import type { IMprisService } from "../types/mpris";
import type { CliRenderer, LayoutDimensions } from "../types";
import type {
	CommandPalette,
	ContentWindow,
	NowPlaying,
	SearchBar,
	Sidebar,
	StatusSidebar,
} from "../components";
import { calculateLayout, cleanupTerminal, getLogger } from "../utils";
import { getLogWriter } from "../utils/LogWriter";
import { shutdownCacheService } from "../services/CacheService";

const logger = getLogger("AppLifecycle");

/**
 * Application Lifecycle Manager
 * Manages signal handlers, cleanup, and graceful shutdown
 */
export class AppLifecycle implements IAppLifecycle {
	private _exiting = false;
	private resizeHandler: (() => void) | null = null;

	constructor(
		private renderer: CliRenderer,
		private mpris: IMprisService,
		private getIsPlaying: () => boolean,
		private components: {
			sidebar: Sidebar;
			searchBar: SearchBar;
			contentWindow: ContentWindow;
			statusSidebar: StatusSidebar;
			nowPlaying: NowPlaying;
			commandPalette: CommandPalette;
		},
		private updateInterval: Timer | null,
		private onLayoutChange: (layout: LayoutDimensions) => void,
	) {}

	/**
	 * Setup process signal handlers for graceful shutdown
	 */
	setupSignalHandlers(): void {
		const gracefulExit = () => this.exit();

		// Handle all termination signals
		process.once("SIGINT", gracefulExit); // Ctrl+C
		process.once("SIGTERM", gracefulExit); // kill command
		process.once("SIGHUP", gracefulExit); // Terminal closed

		// Handle crashes - try to pause music, but don't block
		process.once("uncaughtException", async (err) => {
			logger.error("Uncaught exception:", err);
			// Try to pause, but don't wait - fire and forget
			if (this.getIsPlaying() && this.mpris) {
				this.mpris.pause().catch(() => {});
			}
			await this.cleanup();
			cleanupTerminal();
			process.exit(1);
		});

		process.once("unhandledRejection", async (reason) => {
			logger.error("Unhandled rejection:", reason);
			// Try to pause, but don't wait - fire and forget
			if (this.getIsPlaying() && this.mpris) {
				this.mpris.pause().catch(() => {});
			}
			await this.cleanup();
			cleanupTerminal();
			process.exit(1);
		});

		// Final synchronous cleanup on process exit
		process.once("exit", () => {
			cleanupTerminal();
		});

		// Listen for terminal resize events
		this.resizeHandler = () => this.handleResize();
		process.stdout.on("resize", this.resizeHandler);
	}

	/**
	 * Handle terminal resize event
	 */
	handleResize(): void {
		// Recalculate layout based on new terminal size
		const layout = calculateLayout();

		// Notify app to update all components with new layout
		this.onLayoutChange(layout);
	}

	/**
	 * Gracefully exit the application
	 */
	exit(): void {
		// Prevent double-exit
		if (this._exiting) return;
		this._exiting = true;

		// CRITICAL: Pause music before exiting (user's primary expectation)
		if (this.getIsPlaying() && this.mpris) {
			// Race between pause command and timeout (500ms max)
			Promise.race([
				this.mpris.pause(),
				new Promise((resolve) => setTimeout(resolve, 500)),
			])
				.catch(() => {
					// Pause failed, continue anyway
				})
				.finally(() => {
					this.performExitCleanup();
				});
		} else {
			// Not playing, exit immediately
			this.performExitCleanup();
		}
	}

	/**
	 * Perform the actual exit cleanup and termination
	 */
	private async performExitCleanup(): Promise<void> {
		await this.cleanup();
		cleanupTerminal();

		// Force exit immediately
		process.exit(0);
	}

	/**
	 * Cleanup resources
	 */
	async cleanup(): Promise<void> {
		logger.debug("Cleaning up resources...");

		// Stop update loop
		if (this.updateInterval) {
			clearInterval(this.updateInterval);
			this.updateInterval = null;
		}

		// Remove resize listener
		if (this.resizeHandler) {
			process.stdout.removeListener("resize", this.resizeHandler);
			this.resizeHandler = null;
		}

		// Disconnect MPRIS (synchronous)
		try {
			this.mpris?.disconnect();
		} catch (e) {
			logger.warn("MPRIS disconnect failed:", e);
		}

		// NOTE: We do NOT stop spotifyd here to allow instant restarts
		// spotifyd daemon persists between TUI sessions
		// User can explicitly stop via Ctrl+P → "Stop Spotifyd Daemon"

		// Shutdown cache service (clears intervals)
		try {
			shutdownCacheService();
		} catch (e) {
			logger.warn("Cache shutdown failed:", e);
		}

		// Try to stop/destroy renderer
		try {
			// Type-safe check for optional methods
			const rendererWithOptionalMethods = this.renderer as {
				stop?: () => void;
				destroy?: () => void;
			};

			rendererWithOptionalMethods.stop?.();
			rendererWithOptionalMethods.destroy?.();
		} catch (e) {
			// Ignore errors during cleanup
		}

		// Destroy components
		try {
			this.components.sidebar?.destroy();
			this.components.searchBar?.destroy();
			this.components.contentWindow?.destroy();
			this.components.statusSidebar?.destroy();
			this.components.nowPlaying?.destroy();
			this.components.commandPalette?.destroy();
		} catch (e) {
			// Ignore errors during component cleanup
		}

		// Flush logs before shutdown (CRITICAL - ensure all logs are written)
		try {
			await getLogWriter().shutdown();
		} catch (e) {
			// Log writer shutdown failed, but continue cleanup
			console.error("Failed to flush logs:", e);
		}

		logger.debug("Cleanup complete");
	}
}
