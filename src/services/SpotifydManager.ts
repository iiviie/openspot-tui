/**
 * SpotifydManager Service
 * Manages the spotifyd daemon lifecycle - spawns on app start, kills on app exit
 * This allows users to run a single command without needing a separate terminal
 */

import type { ChildProcess } from "node:child_process";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import open from "open";
import { getLogger } from "../utils";

const logger = getLogger("SpotifydManager");

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
 * Configuration for spotifyd
 */
export interface SpotifydConfig {
	/** Path to spotifyd binary (default: auto-detect) */
	binaryPath: string;
	/** Additional arguments to pass to spotifyd */
	args: string[];
	/** Whether to manage spotifyd lifecycle (start/stop with app) */
	managed: boolean;
	/** Timeout in ms to wait for spotifyd to start */
	startupTimeout: number;
}

/**
 * Find the best spotifyd binary path
 * Priority: 1. Custom env var 2. Downloaded binary 3. System PATH
 */
function findSpotifydBinary(): string {
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

const DEFAULT_CONFIG: SpotifydConfig = {
	binaryPath: findSpotifydBinary(),
	args: ["--no-daemon"],
	managed: true,
	startupTimeout: 5000,
};

/**
 * Result of checking spotifyd status
 */
export interface SpotifydStatus {
	installed: boolean;
	running: boolean;
	managedByUs: boolean;
	authenticated: boolean;
	version?: string;
	pid?: number;
	error?: string;
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
 * Manages spotifyd daemon lifecycle
 */
export class SpotifydManager {
	private config: SpotifydConfig;
	private process: ChildProcess | null = null;
	private managedByUs: boolean = false;

	constructor(config: Partial<SpotifydConfig> = {}) {
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	/**
	 * Check if spotifyd is installed (downloaded or in system PATH)
	 */
	isInstalled(): boolean {
		// First check if using an absolute path (downloaded binary)
		if (this.config.binaryPath.startsWith("/")) {
			return existsSync(this.config.binaryPath);
		}

		// Otherwise check system PATH
		try {
			const result = spawnSync("which", [this.config.binaryPath], {
				encoding: "utf-8",
				timeout: 5000,
			});
			return result.status === 0 && result.stdout.trim().length > 0;
		} catch {
			// Try Windows-style check
			try {
				const result = spawnSync("where", [this.config.binaryPath], {
					encoding: "utf-8",
					timeout: 5000,
				});
				return result.status === 0;
			} catch {
				return false;
			}
		}
	}

	/**
	 * Check if spotifyd is already running (via pgrep or process list)
	 */
	isRunning(): boolean {
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

	/**
	 * Get the PID of running spotifyd process
	 */
	private getRunningPid(): number | undefined {
		try {
			const result = spawnSync("pgrep", ["-x", "spotifyd"], {
				encoding: "utf-8",
				timeout: 5000,
			});
			if (result.status === 0) {
				const pid = parseInt(result.stdout.trim().split("\n")[0], 10);
				return Number.isNaN(pid) ? undefined : pid;
			}
		} catch {
			// Ignore
		}
		return undefined;
	}

	/**
	 * Get current spotifyd status
	 */
	getStatus(): SpotifydStatus {
		const installed = this.isInstalled();
		const running = this.isRunning();
		const pid = running ? this.getRunningPid() : undefined;
		const authenticated = this.isAuthenticated();
		const version = this.getVersion();

		return {
			installed,
			running,
			managedByUs: this.managedByUs,
			authenticated,
			version,
			pid,
		};
	}

	/**
	 * Get spotifyd version
	 */
	getVersion(): string | undefined {
		try {
			const result = spawnSync(this.config.binaryPath, ["--version"], {
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
		// Check for credentials file
		if (existsSync(SPOTIFYD_CREDENTIALS_PATH)) {
			try {
				const content = readFileSync(SPOTIFYD_CREDENTIALS_PATH, "utf-8");
				const creds = JSON.parse(content);
				// spotifyd 0.4.x stores: username, auth_type, auth_data
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
	 * This opens a browser for OAuth and stores credentials
	 * @param onProgress - Optional callback for progress updates (URL found, waiting, etc.)
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
				// Run spotifyd authenticate
				const proc = spawn(this.config.binaryPath, ["authenticate"], {
					stdio: ["pipe", "pipe", "pipe"],
				});

				let stdout = "";
				let stderr = "";
				let authUrl: string | undefined;
				let browserOpened = false;

				proc.stdout?.on("data", (data) => {
					stdout += data.toString();
					// Look for the OAuth URL in output (matches "Browse to: URL" format)
					const urlMatch = stdout.match(
						/(https:\/\/accounts\.spotify\.com[^\s]+)/,
					);
					if (urlMatch && !authUrl) {
						authUrl = urlMatch[1];
						onProgress?.("Opening browser...", authUrl);

						// Automatically open the URL in browser
						open(authUrl)
							.then(() => {
								browserOpened = true;
								onProgress?.(
									"Browser opened - complete login in browser",
									authUrl,
								);
							})
							.catch(() => {
								// Browser open failed, show URL to user
								onProgress?.(`Open this URL: ${authUrl}`, authUrl);
							});
					}

					// Check for "OAuth server listening" message
					if (stdout.includes("OAuth server listening")) {
						if (!browserOpened && authUrl) {
							onProgress?.(`Waiting for login. URL: ${authUrl}`, authUrl);
						}
					}
				});

				proc.stderr?.on("data", (data) => {
					stderr += data.toString();
				});

				proc.on("close", (code) => {
					if (code === 0) {
						resolve({
							success: true,
							message: "Authentication successful!",
							authUrl,
						});
					} else {
						resolve({
							success: false,
							message:
								stderr || stdout || `Authentication failed with code ${code}`,
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

				// Timeout after 2 minutes
				setTimeout(() => {
					proc.kill();
					resolve({
						success: false,
						message: "Authentication timed out (2 min). Try again.",
						authUrl,
					});
				}, 120000);
			} catch (error) {
				resolve({
					success: false,
					message: error instanceof Error ? error.message : "Unknown error",
				});
			}
		});
	}

	/**
	 * Start spotifyd daemon
	 * Returns true if started successfully or already running
	 */
	async start(): Promise<{ success: boolean; message: string }> {
		// Check if already running
		if (this.isRunning()) {
			return {
				success: true,
				message: "spotifyd is already running",
			};
		}

		// Check if installed
		if (!this.isInstalled()) {
			return {
				success: false,
				message: this.getInstallInstructions(),
			};
		}

		// Don't manage if config says so
		if (!this.config.managed) {
			return {
				success: false,
				message: "spotifyd management is disabled. Please start it manually.",
			};
		}

		// Spawn spotifyd
		return new Promise((resolve) => {
			try {
				this.process = spawn(this.config.binaryPath, this.config.args, {
					detached: false,
					stdio: ["ignore", "pipe", "pipe"],
				});

				this.managedByUs = true;

				// Handle errors
				this.process.on("error", (err) => {
					this.managedByUs = false;
					resolve({
						success: false,
						message: `Failed to start spotifyd: ${err.message}`,
					});
				});

				// Handle unexpected exit
				this.process.on("exit", (code) => {
					if (code !== 0 && code !== null) {
						logger.error(`spotifyd exited with code ${code}`);
					}
					this.process = null;
					this.managedByUs = false;
				});

				// Collect stderr for debugging
				let stderrData = "";
				this.process.stderr?.on("data", (data) => {
					stderrData += data.toString();
				});

				// Wait a bit for spotifyd to initialize
				setTimeout(() => {
					if (this.isRunning()) {
						resolve({
							success: true,
							message: "spotifyd started successfully",
						});
					} else {
						resolve({
							success: false,
							message: `spotifyd failed to start: ${stderrData || "Unknown error"}`,
						});
					}
				}, 1500); // Give spotifyd 1.5s to start
			} catch (error) {
				const message =
					error instanceof Error ? error.message : "Unknown error";
				resolve({
					success: false,
					message: `Failed to spawn spotifyd: ${message}`,
				});
			}
		});
	}

	/**
	 * Stop spotifyd daemon (only if we started it)
	 * @param force - If true, kill any running spotifyd process regardless of who started it
	 */
	stop(force: boolean = false): void {
		// First, try to stop our managed process
		if (this.process && this.managedByUs) {
			try {
				const pid = this.process.pid;

				if (force && pid) {
					// Force kill immediately on app exit
					try {
						process.kill(pid, "SIGKILL");
					} catch {
						// Process already dead
					}
				} else if (pid) {
					// Send SIGTERM for graceful shutdown
					this.process.kill("SIGTERM");

					// Schedule force kill after 2s, but unref so it doesn't block exit
					const timeout = setTimeout(() => {
						try {
							// Check if process is still running and kill it
							process.kill(pid, 0); // Check if alive
							process.kill(pid, "SIGKILL");
						} catch {
							// Process already dead
						}
					}, 2000);

					// Don't let this timeout keep Node.js alive
					timeout.unref();
				}
			} catch {
				// Process might already be dead
			}
			this.process = null;
			this.managedByUs = false;
		}

		// If force is true, kill any spotifyd process
		if (force) {
			this.forceKillSpotifyd();
		}
	}

	/**
	 * Force kill any running spotifyd process
	 */
	private forceKillSpotifyd(): void {
		try {
			const result = spawnSync("pkill", ["-f", "spotifyd"], {
				encoding: "utf-8",
				timeout: 5000,
			});
			// pkill returns 0 if at least one process was killed
			if (result.status === 0) {
				this.process = null;
				this.managedByUs = false;
			}
		} catch {
			// Ignore errors
		}
	}

	/**
	 * Get installation instructions for the user's platform
	 */
	private getInstallInstructions(): string {
		const platform = process.platform;

		let instructions = `
╔════════════════════════════════════════════════════════════════╗
║                  spotifyd is not installed                      ║
╚════════════════════════════════════════════════════════════════╝

spotifyd is required for audio playback. Please install it:

`;

		switch (platform) {
			case "linux":
				instructions += `  Ubuntu/Debian:
    sudo apt install spotifyd

  Arch Linux:
    sudo pacman -S spotifyd

  Using Cargo (Rust):
    cargo install spotifyd --locked

  Or download from: https://github.com/Spotifyd/spotifyd/releases
`;
				break;

			case "darwin":
				instructions += `  Using Homebrew:
    brew install spotifyd

  Using Cargo (Rust):
    cargo install spotifyd --locked
`;
				break;

			default:
				instructions += `  Download from: https://github.com/Spotifyd/spotifyd/releases
  
  Or install via Cargo (requires Rust):
    cargo install spotifyd --locked
`;
		}

		instructions += `
After installation, run this application again.
`;

		return instructions;
	}

	/**
	 * Check if we're managing the spotifyd process
	 */
	isManagedByUs(): boolean {
		return this.managedByUs;
	}
}

// Singleton instance
let spotifydManagerInstance: SpotifydManager | null = null;

export function getSpotifydManager(
	config?: Partial<SpotifydConfig>,
): SpotifydManager {
	if (!spotifydManagerInstance) {
		spotifydManagerInstance = new SpotifydManager(config);
	}
	return spotifydManagerInstance;
}
