/**
 * Spotify TUI - Terminal User Interface for Spotify
 * Entry point
 */

import { App } from "./app";
import { cleanupTerminal } from "./utils";

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
	console.error("Fatal error:", error);
	process.exit(1);
});
