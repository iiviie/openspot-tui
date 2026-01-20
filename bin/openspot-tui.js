#!/usr/bin/env bun

/**
 * openspot-tui CLI entry point
 * This script is executed when users run `openspot-tui` or `bunx openspot-tui`
 */

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import and run the main application
const mainPath = join(__dirname, "..", "src", "index.ts");

try {
	await import(mainPath);
} catch (error) {
	console.error("Failed to start openspot-tui:", error.message);
	console.error("");
	console.error("Make sure you have Bun installed: https://bun.sh");
	console.error("Run with: bunx openspot-tui");
	process.exit(1);
}
