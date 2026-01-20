import { App } from "./app";
import {
	createServiceContainer,
	registerServices,
	validateServiceRegistration,
} from "./container";
import { getLogger } from "./utils";
import { getSpotifydInstaller } from "./services/SpotifydInstaller";

const logger = getLogger("Main");

/**
 * First-run setup - ensures spotifyd is installed before starting the TUI
 * This runs on every startup but only does work if spotifyd is missing
 */
async function ensureSpotifydInstalled(): Promise<boolean> {
	const installer = getSpotifydInstaller();

	// Quick check - if already valid, skip
	const verification = await installer.verify();

	if (verification.canProceed) {
		logger.debug(`spotifyd ${verification.version} is ready`);
		return true;
	}

	// Need to install or repair - show user-friendly messages
	console.log("");
	console.log("openspot-tui - First Run Setup");
	console.log("================================");
	console.log("");

	if (verification.needsInstall) {
		console.log("spotifyd not found. Downloading...");
		console.log("");

		const result = await installer.install((message, percent) => {
			if (percent !== undefined) {
				// Simple progress bar
				const filled = Math.floor(percent / 5);
				const empty = 20 - filled;
				const bar = "[" + "=".repeat(filled) + " ".repeat(empty) + "]";
				process.stdout.write(`\r${bar} ${percent}% ${message}`.padEnd(60));
			} else {
				console.log(`  ${message}`);
			}
		});

		console.log(""); // New line after progress

		if (result.success) {
			console.log("");
			console.log(`Done! spotifyd ${result.version} installed.`);
			console.log("");
			console.log("Starting openspot-tui...");
			console.log("");
			return true;
		} else {
			console.error("");
			console.error(`Error: ${result.message}`);
			console.error("");
			console.error("Manual installation:");
			console.error("  Arch Linux: pacman -S spotifyd");
			console.error("  macOS: brew install spotifyd");
			console.error(
				"  Or download from: https://github.com/Spotifyd/spotifyd/releases",
			);
			console.error("");
			return false;
		}
	}

	if (verification.needsRepair) {
		console.log(`spotifyd issue: ${verification.state}`);
		console.log("Attempting repair...");
		console.log("");

		const result = await installer.repair(verification, (message, percent) => {
			if (percent !== undefined) {
				const filled = Math.floor(percent / 5);
				const empty = 20 - filled;
				const bar = "[" + "=".repeat(filled) + " ".repeat(empty) + "]";
				process.stdout.write(`\r${bar} ${percent}% ${message}`.padEnd(60));
			} else {
				console.log(`  ${message}`);
			}
		});

		console.log("");

		if (result.success) {
			console.log(`Repaired! spotifyd ${result.version} ready.`);
			console.log("");
			return true;
		} else {
			console.error(`Repair failed: ${result.message}`);
			console.error("");
			return false;
		}
	}

	// Unknown state
	console.error(`Unexpected state: ${verification.state}`);
	return false;
}

/**
 * Main entry point
 * Sets up DI container and starts the application
 */
async function main() {
	try {
		// Ensure spotifyd is installed before starting TUI
		const spotifydReady = await ensureSpotifydInstalled();
		if (!spotifydReady) {
			process.exit(1);
		}

		// Create and configure DI container
		const container = createServiceContainer();

		// Register all services (bridges singleton pattern with DI)
		registerServices(container);

		// Validate all required services are registered
		if (!validateServiceRegistration(container)) {
			logger.error("Service registration validation failed");
			process.exit(1);
		}

		logger.debug("DI container initialized and validated");

		// Create and start application
		const app = new App();
		await app.start();
	} catch (error) {
		logger.error("Fatal error in main:", error);
		process.exit(1);
	}
}

// Start the application
main();
