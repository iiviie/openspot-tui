#!/usr/bin/env bun

/**
 * Postinstall Script
 * Downloads the appropriate spotifyd binary for the user's platform
 * Now delegates to SpotifydInstaller service for consistency
 *
 * This runs automatically after `npm install` or `bun install`
 *
 * Environment variables:
 *   SPOTIFY_TUI_SKIP_DOWNLOAD=1  - Skip downloading spotifyd (use system version)
 *   SPOTIFY_TUI_SPOTIFYD_PATH    - Custom path to spotifyd binary
 */

// Import from the service directory
// Note: We need to use relative imports since this runs during package install
import { getSpotifydInstaller } from "../services/SpotifydInstaller";

function log(message: string): void {
	console.log(`[openspot-tui] ${message}`);
}

function success(message: string): void {
	console.log(`[openspot-tui] ✅ ${message}`);
}

function error(message: string): void {
	console.error(`[openspot-tui] ❌ ${message}`);
}

async function main(): Promise<void> {
	console.log("");
	log("Setting up openspot-tui...");
	console.log("");

	// Check for skip flag
	if (process.env.SPOTIFY_TUI_SKIP_DOWNLOAD === "1") {
		log("Skipping spotifyd download (SPOTIFY_TUI_SKIP_DOWNLOAD=1)");
		console.log("");
		return;
	}

	// Check if custom path is set
	if (process.env.SPOTIFY_TUI_SPOTIFYD_PATH) {
		const customPath = process.env.SPOTIFY_TUI_SPOTIFYD_PATH;
		log(`Using custom spotifyd path: ${customPath}`);
		console.log("");
		return;
	}

	// Use SpotifydInstaller service
	const installer = getSpotifydInstaller();

	// First, verify if spotifyd is already good
	log("Checking spotifyd installation...");
	const verification = await installer.verify();

	if (verification.canProceed) {
		success(`spotifyd ${verification.version} is ready!`);
		console.log("");
		return;
	}

	// Need to install or repair
	log(`Spotifyd status: ${verification.state}`);

	if (verification.needsRepair) {
		log("Attempting to repair spotifyd...");
		const repairResult = await installer.repair(
			verification,
			(message, percent) => {
				if (percent !== undefined) {
					log(`${message} (${percent}%)`);
				} else {
					log(message);
				}
			},
		);

		if (repairResult.success) {
			console.log("");
			success(repairResult.message);
			if (repairResult.version) {
				success(`Version: ${repairResult.version}`);
			}
			console.log("");
		} else {
			console.log("");
			error(repairResult.message);
			console.log("");
			showManualInstructions(installer);
		}
		return;
	}

	if (verification.needsInstall) {
		log("Installing spotifyd...");
		const installResult = await installer.install((message, percent) => {
			if (percent !== undefined) {
				log(`${message} (${percent}%)`);
			} else {
				log(message);
			}
		});

		if (installResult.success) {
			console.log("");
			success(installResult.message);
			if (installResult.version) {
				success(`Binary location: ${installer.getState().binaryPath}`);
			}
			console.log("");
			log("Run 'openspot-tui' and press Ctrl+P → 'Authenticate Spotifyd'");
			log("to set up OAuth authentication.");
			console.log("");
		} else {
			console.log("");
			error(installResult.message);
			console.log("");
			showManualInstructions(installer);
		}
		return;
	}

	// Unknown state
	error(`Unexpected state: ${verification.state}`);
	showManualInstructions(installer);
}

function showManualInstructions(
	installer: ReturnType<typeof getSpotifydInstaller>,
): void {
	log("Installation failed. Manual installation required:");
	console.log("");
	console.log(installer.getManualInstallInstructions());
}

// Run
main().catch((err) => {
	error(err instanceof Error ? err.message : String(err));
	process.exit(1);
});
