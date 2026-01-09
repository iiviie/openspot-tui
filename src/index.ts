/**
 * Spotify TUI - Terminal User Interface for Spotify
 * Entry point
 */

import { App } from "./app";
import { cleanupTerminal, getLogger } from "./utils";

const logger = getLogger("Main");

/**
 * Main entry point
 */
async function main(): Promise<void> {
	const app = new App();
	await app.start();
}

// Start the application
main().catch((error) => {
	cleanupTerminal();
	logger.error("Fatal error", error);
	process.exit(1);
});
