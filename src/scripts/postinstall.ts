#!/usr/bin/env bun

/**
 * Postinstall Script
 * Downloads the appropriate spotifyd binary for the user's platform
 *
 * This runs automatically after `npm install` or `bun install`
 *
 * Environment variables:
 *   SPOTIFY_TUI_SKIP_DOWNLOAD=1  - Skip downloading spotifyd (use system version)
 *   SPOTIFY_TUI_SPOTIFYD_PATH    - Custom path to spotifyd binary
 */

import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, unlinkSync } from "node:fs";
import { arch, homedir, platform } from "node:os";
import { join } from "node:path";

// ─────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────

// Version 0.4.2 has OAuth support via `spotifyd authenticate`
const SPOTIFYD_VERSION = "0.4.2";
const GITHUB_RELEASE_BASE = `https://github.com/Spotifyd/spotifyd/releases/download/v${SPOTIFYD_VERSION}`;

// Binary directory - stored in user's home to persist across package updates
const BINARY_DIR = join(homedir(), ".spotify-tui", "bin");
const BINARY_PATH = join(BINARY_DIR, "spotifyd");

// Platform to download URL mapping
// Using "full" builds which include all features (pulseaudio, dbus/mpris, etc.)
const PLATFORM_BINARIES: Record<string, Record<string, string>> = {
	linux: {
		x64: `${GITHUB_RELEASE_BASE}/spotifyd-linux-x86_64-full.tar.gz`,
		arm64: `${GITHUB_RELEASE_BASE}/spotifyd-linux-aarch64-full.tar.gz`,
		arm: `${GITHUB_RELEASE_BASE}/spotifyd-linux-armv7-full.tar.gz`,
	},
	darwin: {
		x64: `${GITHUB_RELEASE_BASE}/spotifyd-macos-x86_64-default.tar.gz`,
		arm64: `${GITHUB_RELEASE_BASE}/spotifyd-macos-aarch64-default.tar.gz`,
	},
};

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function log(message: string): void {
	console.log(`[spotify-tui] ${message}`);
}

function error(message: string): void {
	console.error(`[spotify-tui] ❌ ${message}`);
}

function success(message: string): void {
	console.log(`[spotify-tui] ✅ ${message}`);
}

function getPlatformKey(): string {
	const p = platform();
	if (p === "linux") return "linux";
	if (p === "darwin") return "darwin";
	throw new Error(
		`Unsupported platform: ${p}. spotify-tui only supports Linux and macOS.`,
	);
}

function getArchKey(): string {
	const a = arch();
	if (a === "x64" || a === "amd64") return "x64";
	if (a === "arm64" || a === "aarch64") return "arm64";
	if (a === "arm") return "arm";
	throw new Error(
		`Unsupported architecture: ${a}. spotify-tui supports x64, arm64, and arm.`,
	);
}

function getDownloadUrl(): string {
	const platformKey = getPlatformKey();
	const archKey = getArchKey();

	const url = PLATFORM_BINARIES[platformKey]?.[archKey];
	if (!url) {
		throw new Error(`No binary available for ${platformKey}-${archKey}`);
	}

	return url;
}

function isSpotifydInstalled(): { installed: boolean; version?: string } {
	try {
		const result = spawnSync("which", ["spotifyd"], { encoding: "utf-8" });
		if (result.status === 0 && result.stdout.trim().length > 0) {
			// Check version
			const versionResult = spawnSync("spotifyd", ["--version"], {
				encoding: "utf-8",
			});
			const version = versionResult.stdout?.trim() || "unknown";
			return { installed: true, version };
		}
		return { installed: false };
	} catch {
		return { installed: false };
	}
}

function checkSpotifydVersion(binaryPath: string): string | null {
	try {
		const result = spawnSync(binaryPath, ["--version"], { encoding: "utf-8" });
		if (result.status === 0) {
			return result.stdout.trim();
		}
		return null;
	} catch {
		return null;
	}
}

function isVersionOlderThan(current: string, required: string): boolean {
	// Parse version strings like "spotifyd 0.3.5" or "0.4.2"
	const parseVersion = (v: string): number[] => {
		const match = v.match(/(\d+)\.(\d+)\.(\d+)/);
		if (!match) return [0, 0, 0];
		return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
	};

	const currentParts = parseVersion(current);
	const requiredParts = parseVersion(required);

	for (let i = 0; i < 3; i++) {
		if (currentParts[i] < requiredParts[i]) return true;
		if (currentParts[i] > requiredParts[i]) return false;
	}
	return false;
}

async function downloadFile(url: string, destPath: string): Promise<void> {
	log(`Downloading from ${url}...`);

	const response = await fetch(url, {
		redirect: "follow",
		headers: {
			"User-Agent": "spotify-tui-installer",
		},
	});

	if (!response.ok) {
		throw new Error(
			`Failed to download: ${response.status} ${response.statusText}`,
		);
	}

	const arrayBuffer = await response.arrayBuffer();
	await Bun.write(destPath, arrayBuffer);

	log(`Downloaded ${(arrayBuffer.byteLength / 1024 / 1024).toFixed(2)} MB`);
}

async function extractTarGz(tarPath: string, destDir: string): Promise<void> {
	log("Extracting archive...");

	const result = spawnSync("tar", ["-xzf", tarPath, "-C", destDir], {
		encoding: "utf-8",
	});

	if (result.status !== 0) {
		throw new Error(`Failed to extract: ${result.stderr || result.error}`);
	}
}

// ─────────────────────────────────────────────────────────────
// Main Installation Logic
// ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
	console.log("");
	log("Setting up spotify-tui...");
	console.log("");

	// Check for skip flag
	if (process.env.SPOTIFY_TUI_SKIP_DOWNLOAD === "1") {
		log("Skipping spotifyd download (SPOTIFY_TUI_SKIP_DOWNLOAD=1)");

		const systemCheck = isSpotifydInstalled();
		if (systemCheck.installed) {
			success(`System spotifyd found (${systemCheck.version}). You're all set!`);
		} else {
			error("No system spotifyd found. Please install it manually.");
		}
		return;
	}

	// Check if custom path is set
	if (process.env.SPOTIFY_TUI_SPOTIFYD_PATH) {
		const customPath = process.env.SPOTIFY_TUI_SPOTIFYD_PATH;
		if (existsSync(customPath)) {
			success(`Using custom spotifyd at: ${customPath}`);
			return;
		} else {
			error(`Custom spotifyd path not found: ${customPath}`);
			process.exit(1);
		}
	}

	// Check if already downloaded and is the right version
	if (existsSync(BINARY_PATH)) {
		const version = checkSpotifydVersion(BINARY_PATH);
		if (version) {
			if (isVersionOlderThan(version, SPOTIFYD_VERSION)) {
				log(
					`Existing spotifyd (${version}) is older than ${SPOTIFYD_VERSION}, upgrading...`,
				);
				unlinkSync(BINARY_PATH);
			} else {
				success(`spotifyd ${version} is ready!`);
				return;
			}
		} else {
			log("Existing binary seems corrupted, re-downloading...");
			unlinkSync(BINARY_PATH);
		}
	}

	// Check if system spotifyd exists and is new enough
	const systemCheck = isSpotifydInstalled();
	if (systemCheck.installed && systemCheck.version) {
		if (!isVersionOlderThan(systemCheck.version, "0.4.0")) {
			log(`System spotifyd (${systemCheck.version}) supports OAuth.`);
			success("You're all set! Using system-installed spotifyd.");
			return;
		} else {
			log(
				`System spotifyd (${systemCheck.version}) is too old for OAuth support.`,
			);
			log(`Downloading spotifyd ${SPOTIFYD_VERSION} with OAuth support...`);
		}
	}

	// Need to download
	try {
		const downloadUrl = getDownloadUrl();

		// Create binary directory
		if (!existsSync(BINARY_DIR)) {
			mkdirSync(BINARY_DIR, { recursive: true });
			log(`Created directory: ${BINARY_DIR}`);
		}

		// Download to temp file
		const tempTarPath = join(BINARY_DIR, "spotifyd.tar.gz");
		await downloadFile(downloadUrl, tempTarPath);

		// Extract
		await extractTarGz(tempTarPath, BINARY_DIR);

		// Make executable
		chmodSync(BINARY_PATH, 0o755);
		log("Made binary executable");

		// Clean up tar file
		unlinkSync(tempTarPath);

		// Verify installation
		const version = checkSpotifydVersion(BINARY_PATH);
		if (version) {
			console.log("");
			success(`spotifyd ${version} installed successfully!`);
			success(`Binary location: ${BINARY_PATH}`);
			console.log("");
			log("Run 'spotify-tui' and press Ctrl+P → 'Authenticate Spotifyd'");
			log("to set up OAuth authentication.");
			console.log("");
		} else {
			throw new Error("Binary verification failed");
		}
	} catch (err) {
		console.log("");
		error(err instanceof Error ? err.message : String(err));
		console.log("");
		log("Falling back to system spotifyd...");
		log("Please install spotifyd manually:");
		console.log("");

		const p = platform();
		if (p === "darwin") {
			console.log("  brew install spotifyd");
		} else if (p === "linux") {
			console.log("  # Ubuntu/Debian:");
			console.log("  sudo apt install spotifyd");
			console.log("");
			console.log("  # Arch Linux:");
			console.log("  sudo pacman -S spotifyd");
			console.log("");
			console.log("  # Or using Cargo:");
			console.log("  cargo install spotifyd --locked");
		}

		console.log("");
		console.log(
			"  Or download from: https://github.com/Spotifyd/spotifyd/releases",
		);
		console.log("");

		// Don't fail the install - let the app handle missing spotifyd at runtime
	}
}

// Run
main().catch((err) => {
	error(err instanceof Error ? err.message : String(err));
	process.exit(1);
});
