/**
 * SpotifydService - Unified spotifyd management via Rust native module
 *
 * This service replaces the old TypeScript SpotifydManager by delegating
 * process lifecycle management to the Rust SpotifydSupervisor.
 *
 * Key improvements:
 * - spotifyd is spawned as truly detached (survives TUI exit)
 * - Adopts existing spotifyd instances from previous sessions
 * - Single source of truth for process management
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import open from "open";
import { getLogger } from "../utils";
import { getSpotifydInstaller } from "./SpotifydInstaller";

const logger = getLogger("SpotifydService");

// Path where postinstall script downloads spotifyd
const DOWNLOADED_BINARY_PATH = join(
	homedir(),
	".spotify-tui",
	"bin",
	"spotifyd",
);

// Path where spotifyd stores OAuth credentials (spotifyd 0.4.x uses oauth subdirectory)
const SPOTIFYD_CREDENTIALS_PATH = join(
	homedir(),
	".cache",
	"spotifyd",
	"oauth",
	"credentials.json",
);

/**
 * Result of spotifyd status check
 */
export interface SpotifydStatus {
	installed: boolean;
	running: boolean;
	authenticated: boolean;
	version?: string;
	pid?: number;
}

/**
 * Result of start operation
 */
export interface SpotifydStartResult {
	success: boolean;
	message: string;
	pid?: number;
	adopted: boolean;
}

/**
 * Result of authentication attempt
 */
export interface AuthResult {
	success: boolean;
	message: string;
	authUrl?: string;
}

/**
 * Native module types
 */
interface NativeSpotifydSupervisor {
	startOrAdopt(): Promise<{
		success: boolean;
		message: string;
		pid?: number;
		adopted: boolean;
	}>;
	start(): Promise<void>;
	stop(force?: boolean): Promise<void>;
	getStatus(): { running: boolean; pid?: number; authenticated: boolean };
	isRunning(): Promise<boolean>;
	isHealthy(): Promise<boolean>;
	getPid(): Promise<number | null>;
	onStatusChange(
		callback: (status: {
			running: boolean;
			pid?: number;
			authenticated: boolean;
		}) => void,
	): void;
}

/**
 * SpotifydService - manages spotifyd daemon via Rust native module
 */
export class SpotifydService {
	private supervisor: NativeSpotifydSupervisor | null = null;
	private initialized = false;
	private binaryPath: string;

	constructor() {
		this.binaryPath = this.findSpotifydBinary();
	}

	/**
	 * Find the best spotifyd binary path
	 */
	private findSpotifydBinary(): string {
		// 1. Check for custom path via environment variable
		if (process.env.SPOTIFY_TUI_SPOTIFYD_PATH) {
			return process.env.SPOTIFY_TUI_SPOTIFYD_PATH;
		}

		// 2. Check for downloaded binary
		if (existsSync(DOWNLOADED_BINARY_PATH)) {
			return DOWNLOADED_BINARY_PATH;
		}

		// 3. Fall back to system PATH
		return "spotifyd";
	}

	/**
	 * Initialize the native module
	 */
	async initialize(): Promise<boolean> {
		if (this.initialized) return true;

		try {
			// Dynamic import of native module
			// @ts-ignore - Native module will be available after build
			const native = await import("../../mpris-native/index.js");

			// Create supervisor with device name config
			this.supervisor = new native.SpotifydSupervisor({
				deviceName: "spotify-tui",
			});

			this.initialized = true;
			logger.info("SpotifydService initialized with native module");
			return true;
		} catch (error) {
			logger.error("Failed to initialize native SpotifydSupervisor:", error);
			return false;
		}
	}

	// ─────────────────────────────────────────────────────────────
	// Installation & Authentication (stays in TypeScript)
	// ─────────────────────────────────────────────────────────────

	/**
	 * Check if spotifyd is installed
	 */
	isInstalled(): boolean {
		// First check if using an absolute path (downloaded binary)
		if (this.binaryPath.startsWith("/")) {
			return existsSync(this.binaryPath);
		}

		// Otherwise check system PATH
		try {
			const result = spawnSync("which", [this.binaryPath], {
				encoding: "utf-8",
				timeout: 5000,
			});
			return result.status === 0 && result.stdout.trim().length > 0;
		} catch {
			return false;
		}
	}

	/**
	 * Get spotifyd version
	 */
	getVersion(): string | undefined {
		try {
			const result = spawnSync(this.binaryPath, ["--version"], {
				encoding: "utf-8",
				timeout: 5000,
			});
			if (result.status === 0) {
				return result.stdout.trim();
			}
		} catch {
			// Ignore
		}
		return undefined;
	}

	/**
	 * Check if spotifyd has OAuth credentials stored
	 */
	isAuthenticated(): boolean {
		if (existsSync(SPOTIFYD_CREDENTIALS_PATH)) {
			try {
				const content = readFileSync(SPOTIFYD_CREDENTIALS_PATH, "utf-8");
				const creds = JSON.parse(content);
				if (creds.username && creds.auth_data) {
					return true;
				}
			} catch {
				// Invalid credentials file
			}
		}
		return false;
	}

	/**
	 * Run spotifyd authenticate command
	 */
	async authenticate(
		onProgress?: (status: string, url?: string) => void,
	): Promise<AuthResult> {
		if (!this.isInstalled()) {
			return {
				success: false,
				message: "spotifyd is not installed",
			};
		}

		// Check version supports authenticate command (0.4.0+)
		const version = this.getVersion();
		if (version) {
			const match = version.match(/(\d+)\.(\d+)\.(\d+)/);
			if (match) {
				const major = parseInt(match[1], 10);
				const minor = parseInt(match[2], 10);
				if (major === 0 && minor < 4) {
					return {
						success: false,
						message: `spotifyd ${version} doesn't support OAuth. Need version 0.4.0+`,
					};
				}
			}
		}

		onProgress?.("Starting authentication...");

		return new Promise((resolve) => {
			try {
				const proc = spawn(this.binaryPath, ["authenticate"], {
					stdio: ["ignore", "pipe", "pipe"],
				});

				let authUrl: string | undefined;
				let stdout = "";
				let stderr = "";

				proc.stdout?.on("data", (data: Buffer) => {
					const text = data.toString();
					stdout += text;

					// Look for the auth URL
					const urlMatch = text.match(/https:\/\/accounts\.spotify\.com[^\s]+/);
					if (urlMatch) {
						authUrl = urlMatch[0];
						onProgress?.("Opening browser for authentication...", authUrl);

						// Auto-open browser
						open(authUrl).catch(() => {
							onProgress?.("Please open this URL manually:", authUrl);
						});
					}

					// Check for success message
					if (
						text.includes("Successfully authenticated") ||
						text.includes("Credentials saved")
					) {
						onProgress?.("Authentication successful!");
					}
				});

				proc.stderr?.on("data", (data: Buffer) => {
					stderr += data.toString();
				});

				proc.on("close", (code) => {
					if (code === 0 || this.isAuthenticated()) {
						resolve({
							success: true,
							message: "Authentication successful! Credentials saved.",
							authUrl,
						});
					} else {
						resolve({
							success: false,
							message: stderr || stdout || "Authentication failed",
							authUrl,
						});
					}
				});

				proc.on("error", (err) => {
					resolve({
						success: false,
						message: `Failed to run authenticate: ${err.message}`,
					});
				});

				// Timeout after 5 minutes
				setTimeout(
					() => {
						if (proc.exitCode === null) {
							proc.kill();
							resolve({
								success: false,
								message: "Authentication timed out after 5 minutes",
								authUrl,
							});
						}
					},
					5 * 60 * 1000,
				);
			} catch (error) {
				resolve({
					success: false,
					message: error instanceof Error ? error.message : "Unknown error",
				});
			}
		});
	}

	// ─────────────────────────────────────────────────────────────
	// Process Management (delegated to Rust)
	// ─────────────────────────────────────────────────────────────

	/**
	 * Start spotifyd or adopt an existing instance
	 * This is the main method to use for starting spotifyd
	 */
	async start(): Promise<SpotifydStartResult> {
		// Verify installation first
		const installer = getSpotifydInstaller();
		const verification = await installer.verify();

		if (!verification.canProceed) {
			return {
				success: false,
				message: `spotifyd verification failed: ${verification.error || verification.state}`,
				adopted: false,
			};
		}

		// Initialize native module if needed
		if (!this.initialized) {
			const ok = await this.initialize();
			if (!ok) {
				return {
					success: false,
					message: "Failed to initialize native spotifyd supervisor",
					adopted: false,
				};
			}
		}

		try {
			const result = await this.supervisor!.startOrAdopt();
			logger.info(`spotifyd start result: ${result.message}`);
			return result;
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			logger.error("Failed to start spotifyd:", message);
			return {
				success: false,
				message: `Failed to start spotifyd: ${message}`,
				adopted: false,
			};
		}
	}

	/**
	 * Stop spotifyd
	 * @param force - If true, kill any spotifyd. If false, only kill if we spawned/adopted it.
	 */
	async stop(force = false): Promise<void> {
		if (!this.supervisor) {
			logger.warn("SpotifydService not initialized, nothing to stop");
			return;
		}

		try {
			await this.supervisor.stop(force);
			logger.info("spotifyd stopped");
		} catch (error) {
			logger.error("Failed to stop spotifyd:", error);
		}
	}

	/**
	 * Check if spotifyd process is running
	 */
	async isRunning(): Promise<boolean> {
		if (!this.supervisor) {
			// Fallback to pgrep if not initialized
			try {
				const result = spawnSync("pgrep", ["-x", "spotifyd"], {
					encoding: "utf-8",
					timeout: 5000,
				});
				return result.status === 0 && result.stdout.trim().length > 0;
			} catch {
				return false;
			}
		}

		try {
			return await this.supervisor.isRunning();
		} catch {
			return false;
		}
	}

	/**
	 * Check if spotifyd is healthy (running AND D-Bus responsive)
	 */
	async isHealthy(): Promise<boolean> {
		if (!this.supervisor) {
			return false;
		}

		try {
			return await this.supervisor.isHealthy();
		} catch {
			return false;
		}
	}

	/**
	 * Get current spotifyd status
	 * Note: This is synchronous, so we use pgrep to check actual running state
	 */
	getStatus(): SpotifydStatus {
		const installed = this.isInstalled();
		const authenticated = this.isAuthenticated();
		const version = this.getVersion();

		// Always use pgrep to check actual running state (synchronous, reliable)
		// The Rust supervisor's internal state may be stale if spotifyd was killed externally
		let running = false;
		let pid: number | undefined;

		try {
			const result = spawnSync("pgrep", ["-x", "spotifyd"], {
				encoding: "utf-8",
				timeout: 5000,
			});
			running = result.status === 0 && result.stdout.trim().length > 0;
			if (running) {
				pid = parseInt(result.stdout.trim().split("\n")[0], 10);
				if (Number.isNaN(pid)) pid = undefined;
			}
		} catch {
			running = false;
		}

		return {
			installed,
			running,
			authenticated,
			version,
			pid,
		};
	}

	/**
	 * Get the PID of the tracked spotifyd process
	 */
	async getPid(): Promise<number | null> {
		if (!this.supervisor) return null;

		try {
			return await this.supervisor.getPid();
		} catch {
			return null;
		}
	}
}

// ─────────────────────────────────────────────────────────────
// Singleton
// ─────────────────────────────────────────────────────────────

let instance: SpotifydService | null = null;

export function getSpotifydService(): SpotifydService {
	if (!instance) {
		instance = new SpotifydService();
	}
	return instance;
}
