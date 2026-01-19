/**
 * SpotifydInstaller Service
 * Handles automatic installation, verification, and repair of spotifyd binary
 * Runs on every app startup to ensure spotifyd integrity
 */

import { spawnSync } from "node:child_process";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	statSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { arch, homedir, platform } from "node:os";
import { join } from "node:path";
import { getLogger } from "../utils";
import {
	checkFileIntegrity,
	compareVersions,
	getBackoffDelay,
	isVersionValid,
	parseVersion,
	sleep,
} from "../utils/integrity";

const logger = getLogger("SpotifydInstaller");

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const SPOTIFYD_VERSION = "0.4.2";
const MIN_REQUIRED_VERSION = "0.4.0"; // OAuth support
const GITHUB_RELEASE_BASE = `https://github.com/Spotifyd/spotifyd/releases/download/v${SPOTIFYD_VERSION}`;

const BINARY_DIR = join(homedir(), ".spotify-tui", "bin");
const BINARY_PATH = join(BINARY_DIR, "spotifyd");
const VERIFIED_MARKER_PATH = join(BINARY_DIR, ".verified");
const LOCKFILE_PATH = join(BINARY_DIR, ".install-lock");

// Platform to download URL mapping
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
// Types
// ─────────────────────────────────────────────────────────────

/**
 * Installation states (state machine)
 */
export type InstallState =
	| "not_checked"
	| "checking"
	| "valid"
	| "missing"
	| "corrupted"
	| "outdated"
	| "wrong_arch"
	| "no_permissions"
	| "installing"
	| "repairing"
	| "upgrading"
	| "error";

/**
 * Verification result
 */
export interface VerificationResult {
	state: InstallState;
	version?: string;
	error?: string;
	needsInstall: boolean;
	needsRepair: boolean;
	canProceed: boolean;
}

/**
 * Installation progress callback
 */
export type ProgressCallback = (message: string, percent?: number) => void;

/**
 * Verification cache stored in .verified file
 */
interface VerificationCache {
	version: string;
	verified_at: number;
	platform: string;
	arch: string;
	binary_mtime: number;
}

/**
 * Installation result
 */
export interface InstallResult {
	success: boolean;
	message: string;
	version?: string;
}

// ─────────────────────────────────────────────────────────────
// SpotifydInstaller Class
// ─────────────────────────────────────────────────────────────

export class SpotifydInstaller {
	private state: InstallState = "not_checked";
	private currentVersion?: string;

	/**
	 * Verify spotifyd installation using tiered approach
	 * Tier 1: Fast path using cache (~5-10ms)
	 * Tier 2: Version check (~100ms)
	 * Tier 3: Full validation (only on first install)
	 */
	async verify(): Promise<VerificationResult> {
		this.state = "checking";

		// Check for environment variable override
		const customPath = process.env.SPOTIFY_TUI_SPOTIFYD_PATH;
		if (customPath) {
			logger.info(`Using custom spotifyd path: ${customPath}`);
			return this.verifyCustomPath(customPath);
		}

		// Tier 1: Fast check using cache
		const cacheResult = this.checkVerificationCache();
		if (cacheResult.valid) {
			this.state = "valid";
			this.currentVersion = cacheResult.version;
			logger.info(`Spotifyd verified via cache: ${cacheResult.version}`);
			return {
				state: "valid",
				version: cacheResult.version,
				needsInstall: false,
				needsRepair: false,
				canProceed: true,
			};
		}

		// Tier 2: Check file integrity
		const fileCheck = checkFileIntegrity(BINARY_PATH);

		if (!fileCheck.exists) {
			this.state = "missing";
			logger.info("Spotifyd binary not found");
			return {
				state: "missing",
				needsInstall: true,
				needsRepair: false,
				canProceed: false,
			};
		}

		if (!fileCheck.executable) {
			this.state = "no_permissions";
			logger.warn("Spotifyd binary exists but not executable");
			return {
				state: "no_permissions",
				needsInstall: false,
				needsRepair: true,
				canProceed: false,
				error: "Binary is not executable",
			};
		}

		// Tier 3: Version check
		const version = this.getVersionFromBinary(BINARY_PATH);

		if (!version) {
			this.state = "corrupted";
			logger.warn("Spotifyd binary exists but version check failed");
			return {
				state: "corrupted",
				needsInstall: false,
				needsRepair: true,
				canProceed: false,
				error: "Binary is corrupted or invalid",
			};
		}

		// Check if version is sufficient
		if (!isVersionValid(version, MIN_REQUIRED_VERSION)) {
			this.state = "outdated";
			logger.warn(
				`Spotifyd version ${version} is outdated (need ${MIN_REQUIRED_VERSION}+)`,
			);
			return {
				state: "outdated",
				version,
				needsInstall: false,
				needsRepair: true,
				canProceed: false,
				error: `Version ${version} is too old, need ${MIN_REQUIRED_VERSION}+`,
			};
		}

		// All checks passed - update cache and proceed
		this.state = "valid";
		this.currentVersion = version;
		this.saveVerificationCache(version, fileCheck.mtime!);

		logger.info(`Spotifyd verified: ${version}`);

		return {
			state: "valid",
			version,
			needsInstall: false,
			needsRepair: false,
			canProceed: true,
		};
	}

	/**
	 * Install spotifyd from GitHub releases
	 */
	async install(onProgress?: ProgressCallback): Promise<InstallResult> {
		this.state = "installing";

		try {
			onProgress?.("Checking platform compatibility...", 10);

			// Get download URL for current platform
			const downloadUrl = this.getDownloadUrl();

			// Create binary directory
			this.ensureBinaryDirectory();

			// Clean up any partial/temp files from previous failed installs
			onProgress?.("Cleaning up previous installation attempts...", 20);
			this.cleanupTempFiles();

			// Acquire lock to prevent concurrent installations
			onProgress?.("Acquiring installation lock...", 25);
			if (!this.acquireLock()) {
				return {
					success: false,
					message: "Another installation is in progress. Please wait.",
				};
			}

			try {
				// Download with retry logic
				onProgress?.("Downloading spotifyd...", 30);
				const tarPath = await this.downloadWithRetry(downloadUrl, onProgress);

				// Extract
				onProgress?.("Extracting archive...", 80);
				this.extractTarGz(tarPath);

				// Make executable
				onProgress?.("Setting permissions...", 90);
				chmodSync(BINARY_PATH, 0o755);

				// Clean up tar file
				unlinkSync(tarPath);

				// Verify installation
				onProgress?.("Verifying installation...", 95);
				const version = this.getVersionFromBinary(BINARY_PATH);

				if (!version) {
					throw new Error("Installation verification failed");
				}

				// Update cache
				const fileCheck = checkFileIntegrity(BINARY_PATH);
				this.saveVerificationCache(version, fileCheck.mtime!);

				this.state = "valid";
				this.currentVersion = version;

				onProgress?.("Installation complete!", 100);

				return {
					success: true,
					message: `spotifyd ${version} installed successfully!`,
					version,
				};
			} finally {
				this.releaseLock();
			}
		} catch (error) {
			this.state = "error";
			const message = error instanceof Error ? error.message : String(error);
			logger.error(`Installation failed: ${message}`);

			return {
				success: false,
				message: `Installation failed: ${message}`,
			};
		}
	}

	/**
	 * Repair spotifyd installation based on detected issue
	 */
	async repair(
		verificationResult: VerificationResult,
		onProgress?: ProgressCallback,
	): Promise<InstallResult> {
		this.state = "repairing";

		logger.info(`Attempting repair for state: ${verificationResult.state}`);

		switch (verificationResult.state) {
			case "no_permissions":
				// Just fix permissions
				try {
					onProgress?.("Fixing execute permissions...", 50);
					chmodSync(BINARY_PATH, 0o755);

					onProgress?.("Permissions fixed!", 100);

					this.state = "valid";
					return {
						success: true,
						message: "Execute permissions restored",
					};
				} catch (error) {
					return {
						success: false,
						message: `Failed to fix permissions: ${error}`,
					};
				}

			case "corrupted":
			case "outdated":
			case "wrong_arch":
				// Delete corrupted/old binary and reinstall
				try {
					onProgress?.("Removing corrupted binary...", 10);
					if (existsSync(BINARY_PATH)) {
						unlinkSync(BINARY_PATH);
					}
					this.invalidateCache();

					onProgress?.("Reinstalling...", 20);
					return await this.install(onProgress);
				} catch (error) {
					return {
						success: false,
						message: `Repair failed: ${error}`,
					};
				}

			default:
				return {
					success: false,
					message: `Cannot repair state: ${verificationResult.state}`,
				};
		}
	}

	/**
	 * Get current installation state
	 */
	getState(): {
		state: InstallState;
		version?: string;
		binaryPath: string;
	} {
		return {
			state: this.state,
			version: this.currentVersion,
			binaryPath: BINARY_PATH,
		};
	}

	/**
	 * Get installation instructions for manual installation
	 */
	getManualInstallInstructions(): string {
		const p = platform();

		let instructions = `
╔════════════════════════════════════════════════════════════════╗
║              Manual spotifyd Installation                       ║
╚════════════════════════════════════════════════════════════════╝

spotifyd ${MIN_REQUIRED_VERSION}+ is required for OAuth support.

`;

		switch (p) {
			case "linux":
				instructions += `Ubuntu/Debian:
  sudo apt install spotifyd

Arch Linux:
  sudo pacman -S spotifyd

Using Cargo (Rust):
  cargo install spotifyd --locked

Or download from:
  https://github.com/Spotifyd/spotifyd/releases
`;
				break;

			case "darwin":
				instructions += `Using Homebrew:
  brew install spotifyd

Using Cargo (Rust):
  cargo install spotifyd --locked

Or download from:
  https://github.com/Spotifyd/spotifyd/releases
`;
				break;

			default:
				instructions += `Download from:
  https://github.com/Spotifyd/spotifyd/releases

Or install via Cargo (requires Rust):
  cargo install spotifyd --locked
`;
		}

		instructions += `
After installation, restart the application.
`;

		return instructions;
	}

	// ─────────────────────────────────────────────────────────────
	// Private Helpers
	// ─────────────────────────────────────────────────────────────

	/**
	 * Check verification cache (Tier 1 - fast path)
	 */
	private checkVerificationCache(): { valid: boolean; version?: string } {
		try {
			if (!existsSync(VERIFIED_MARKER_PATH)) {
				return { valid: false };
			}

			const cacheContent = readFileSync(VERIFIED_MARKER_PATH, "utf-8");
			const cache: VerificationCache = JSON.parse(cacheContent);

			// Validate cache matches current platform
			if (cache.platform !== platform() || cache.arch !== arch()) {
				return { valid: false };
			}

			// Check if binary file was modified since cache
			const fileCheck = checkFileIntegrity(BINARY_PATH);
			if (!fileCheck.exists || fileCheck.mtime !== cache.binary_mtime) {
				return { valid: false };
			}

			// Cache is valid
			return { valid: true, version: cache.version };
		} catch {
			return { valid: false };
		}
	}

	/**
	 * Save verification cache
	 */
	private saveVerificationCache(version: string, binaryMtime: number): void {
		try {
			const cache: VerificationCache = {
				version,
				verified_at: Date.now(),
				platform: platform(),
				arch: arch(),
				binary_mtime: binaryMtime,
			};

			writeFileSync(VERIFIED_MARKER_PATH, JSON.stringify(cache, null, 2));
		} catch (error) {
			logger.warn(`Failed to save verification cache: ${error}`);
		}
	}

	/**
	 * Invalidate verification cache
	 */
	private invalidateCache(): void {
		try {
			if (existsSync(VERIFIED_MARKER_PATH)) {
				unlinkSync(VERIFIED_MARKER_PATH);
			}
		} catch {
			// Ignore
		}
	}

	/**
	 * Verify custom path provided via environment variable
	 */
	private verifyCustomPath(customPath: string): VerificationResult {
		const fileCheck = checkFileIntegrity(customPath);

		if (!fileCheck.exists) {
			return {
				state: "error",
				error: `Custom path does not exist: ${customPath}`,
				needsInstall: false,
				needsRepair: false,
				canProceed: false,
			};
		}

		if (!fileCheck.executable) {
			return {
				state: "error",
				error: `Custom binary is not executable: ${customPath}`,
				needsInstall: false,
				needsRepair: false,
				canProceed: false,
			};
		}

		const version = this.getVersionFromBinary(customPath);

		if (!version) {
			return {
				state: "error",
				error: "Custom binary version check failed",
				needsInstall: false,
				needsRepair: false,
				canProceed: false,
			};
		}

		if (!isVersionValid(version, MIN_REQUIRED_VERSION)) {
			return {
				state: "error",
				error: `Custom binary version ${version} is too old (need ${MIN_REQUIRED_VERSION}+)`,
				version,
				needsInstall: false,
				needsRepair: false,
				canProceed: false,
			};
		}

		this.state = "valid";
		this.currentVersion = version;

		return {
			state: "valid",
			version,
			needsInstall: false,
			needsRepair: false,
			canProceed: true,
		};
	}

	/**
	 * Get version by spawning binary with --version flag
	 */
	private getVersionFromBinary(binaryPath: string): string | null {
		try {
			const result = spawnSync(binaryPath, ["--version"], {
				encoding: "utf-8",
				timeout: 5000,
			});

			if (result.status === 0 && result.stdout) {
				return result.stdout.trim();
			}

			return null;
		} catch {
			return null;
		}
	}

	/**
	 * Get download URL for current platform and architecture
	 */
	private getDownloadUrl(): string {
		const p = platform();
		const a = arch();

		let platformKey: string;
		if (p === "linux") platformKey = "linux";
		else if (p === "darwin") platformKey = "darwin";
		else {
			throw new Error(
				`Unsupported platform: ${p}. Only Linux and macOS are supported.`,
			);
		}

		let archKey: string;
		if (a === "x64" || a === "amd64") archKey = "x64";
		else if (a === "arm64" || a === "aarch64") archKey = "arm64";
		else if (a === "arm") archKey = "arm";
		else {
			throw new Error(`Unsupported architecture: ${a}`);
		}

		const url = PLATFORM_BINARIES[platformKey]?.[archKey];
		if (!url) {
			throw new Error(`No binary available for ${platformKey}-${archKey}`);
		}

		return url;
	}

	/**
	 * Ensure binary directory exists
	 */
	private ensureBinaryDirectory(): void {
		if (!existsSync(BINARY_DIR)) {
			mkdirSync(BINARY_DIR, { recursive: true });
		}
	}

	/**
	 * Clean up temp files from previous failed installations
	 */
	private cleanupTempFiles(): void {
		try {
			const tempFiles = [
				join(BINARY_DIR, "spotifyd.tar.gz"),
				join(BINARY_DIR, "spotifyd.tar.gz.partial"),
				join(BINARY_DIR, "spotifyd.tmp"),
			];

			for (const file of tempFiles) {
				if (existsSync(file)) {
					unlinkSync(file);
					logger.info(`Cleaned up temp file: ${file}`);
				}
			}
		} catch (error) {
			logger.warn(`Failed to clean up temp files: ${error}`);
		}
	}

	/**
	 * Acquire installation lock
	 */
	private acquireLock(): boolean {
		try {
			// Check if lock exists and is stale (>5 minutes old)
			if (existsSync(LOCKFILE_PATH)) {
				const stats = statSync(LOCKFILE_PATH);
				const ageMs = Date.now() - stats.mtimeMs;

				if (ageMs > 5 * 60 * 1000) {
					// Stale lock, remove it
					unlinkSync(LOCKFILE_PATH);
					logger.warn("Removed stale installation lock");
				} else {
					// Active lock
					return false;
				}
			}

			// Create lock file
			writeFileSync(LOCKFILE_PATH, String(process.pid));
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Release installation lock
	 */
	private releaseLock(): void {
		try {
			if (existsSync(LOCKFILE_PATH)) {
				unlinkSync(LOCKFILE_PATH);
			}
		} catch {
			// Ignore
		}
	}

	/**
	 * Download file with retry logic and exponential backoff
	 */
	private async downloadWithRetry(
		url: string,
		onProgress?: ProgressCallback,
		maxAttempts: number = 3,
	): Promise<string> {
		const destPath = join(BINARY_DIR, "spotifyd.tar.gz");

		for (let attempt = 0; attempt < maxAttempts; attempt++) {
			try {
				logger.info(`Download attempt ${attempt + 1}/${maxAttempts}`);

				const response = await fetch(url, {
					redirect: "follow",
					headers: {
						"User-Agent": "spotify-tui-installer",
					},
				});

				if (!response.ok) {
					throw new Error(`HTTP ${response.status}: ${response.statusText}`);
				}

				const arrayBuffer = await response.arrayBuffer();
				await Bun.write(destPath, arrayBuffer);

				const sizeMB = (arrayBuffer.byteLength / 1024 / 1024).toFixed(2);
				logger.info(`Downloaded ${sizeMB} MB`);

				onProgress?.(`Downloaded ${sizeMB} MB`, 70);

				return destPath;
			} catch (error) {
				const isLastAttempt = attempt === maxAttempts - 1;

				if (isLastAttempt) {
					throw error;
				}

				// Wait with exponential backoff before retrying
				const delay = getBackoffDelay(attempt);
				logger.warn(`Download failed, retrying in ${delay}ms: ${error}`);
				onProgress?.(
					`Download failed, retrying in ${delay / 1000}s...`,
					30 + attempt * 10,
				);
				await sleep(delay);
			}
		}

		throw new Error("Download failed after all retries");
	}

	/**
	 * Extract tar.gz archive
	 */
	private extractTarGz(tarPath: string): void {
		const result = spawnSync("tar", ["-xzf", tarPath, "-C", BINARY_DIR], {
			encoding: "utf-8",
			timeout: 30000,
		});

		if (result.status !== 0) {
			throw new Error(
				`Tar extraction failed: ${result.stderr || result.error}`,
			);
		}
	}
}

// ─────────────────────────────────────────────────────────────
// Singleton
// ─────────────────────────────────────────────────────────────

let installerInstance: SpotifydInstaller | null = null;

export function getSpotifydInstaller(): SpotifydInstaller {
	if (!installerInstance) {
		installerInstance = new SpotifydInstaller();
	}
	return installerInstance;
}
