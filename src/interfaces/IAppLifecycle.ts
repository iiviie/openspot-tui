/**
 * Application Lifecycle Interface
 * Manages signal handlers, cleanup, and graceful shutdown
 */

export interface IAppLifecycle {
	/**
	 * Setup process signal handlers for graceful shutdown
	 */
	setupSignalHandlers(): void;

	/**
	 * Handle terminal resize event
	 */
	handleResize(): void;

	/**
	 * Gracefully exit the application
	 */
	exit(): void;

	/**
	 * Cleanup resources
	 */
	cleanup(): Promise<void>;
}
