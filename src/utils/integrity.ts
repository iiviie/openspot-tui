/**
 * File integrity and verification utilities
 * Used for checking spotifyd binary validity
 */

import { accessSync, constants, statSync } from "node:fs";

export interface FileCheckResult {
	exists: boolean;
	executable?: boolean;
	size?: number;
	mtime?: number; // Modified time in ms
	error?: string;
}

/**
 * Check if file exists and is executable
 * Fast check using sync operations (target: <5ms)
 */
export function checkFileIntegrity(path: string): FileCheckResult {
	try {
		// Check if file exists
		const stats = statSync(path);

		// File must be a regular file and non-empty
		if (!stats.isFile() || stats.size === 0) {
			return {
				exists: true,
				executable: false,
				size: stats.size,
				error: "File is empty or not a regular file",
			};
		}

		// Check execute permission
		let executable = false;
		try {
			accessSync(path, constants.X_OK);
			executable = true;
		} catch {
			executable = false;
		}

		return {
			exists: true,
			executable,
			size: stats.size,
			mtime: stats.mtimeMs,
		};
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return { exists: false };
		}

		return {
			exists: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

/**
 * Parse version string like "spotifyd 0.3.5" or "0.4.2"
 * Returns [major, minor, patch] or null if invalid
 */
export function parseVersion(versionString: string): number[] | null {
	const match = versionString.match(/(\d+)\.(\d+)\.(\d+)/);
	if (!match) return null;

	return [
		parseInt(match[1], 10),
		parseInt(match[2], 10),
		parseInt(match[3], 10),
	];
}

/**
 * Compare two version strings
 * Returns:
 *   -1 if current < required (too old)
 *    0 if current === required
 *    1 if current > required (newer)
 */
export function compareVersions(current: string, required: string): -1 | 0 | 1 {
	const currentParts = parseVersion(current);
	const requiredParts = parseVersion(required);

	if (!currentParts || !requiredParts) {
		return -1; // Invalid version strings treated as too old
	}

	for (let i = 0; i < 3; i++) {
		if (currentParts[i] < requiredParts[i]) return -1;
		if (currentParts[i] > requiredParts[i]) return 1;
	}

	return 0;
}

/**
 * Check if version meets minimum requirement
 */
export function isVersionValid(current: string, minRequired: string): boolean {
	return compareVersions(current, minRequired) >= 0;
}

/**
 * Calculate exponential backoff delay
 * @param attempt - Current attempt number (0-indexed)
 * @param baseDelayMs - Base delay in milliseconds
 * @param maxDelayMs - Maximum delay in milliseconds
 * @returns Delay in milliseconds
 */
export function getBackoffDelay(
	attempt: number,
	baseDelayMs: number = 1000,
	maxDelayMs: number = 30000,
): number {
	const delay = baseDelayMs * Math.pow(2, attempt);
	return Math.min(delay, maxDelayMs);
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
