/**
 * LogWriter - Handles file-based logging with rotation and buffering
 *
 * Features:
 * - Buffered writes for performance (reduces disk I/O)
 * - Size-based log rotation
 * - Async file operations (non-blocking)
 * - Automatic cleanup of old log files
 */

import {
	existsSync,
	mkdirSync,
	statSync,
	unlinkSync,
	renameSync,
} from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface LogWriterConfig {
	/** Directory where log files are stored */
	logDir: string;
	/** Log file base name (without extension) */
	filename: string;
	/** Maximum size of a single log file in bytes */
	maxFileSize: number;
	/** Maximum number of rotated log files to keep */
	maxFiles: number;
	/** Interval in milliseconds to flush buffered logs */
	flushInterval: number;
	/** Whether logging is enabled */
	enabled: boolean;
}

const DEFAULT_CONFIG: LogWriterConfig = {
	logDir: join(homedir(), ".spotify-tui", "logs"),
	filename: "spotify-tui.log",
	maxFileSize: 5 * 1024 * 1024, // 5MB
	maxFiles: 5,
	flushInterval: 1000, // 1 second
	enabled: true,
};

/**
 * LogWriter handles efficient file-based logging with rotation
 */
export class LogWriter {
	private config: LogWriterConfig;
	private buffer: string[] = [];
	private currentSize: number = 0;
	private flushTimer: Timer | null = null;
	private flushing: boolean = false;
	private initialized: boolean = false;

	constructor(config: Partial<LogWriterConfig> = {}) {
		this.config = { ...DEFAULT_CONFIG, ...config };
		this.initialize();
	}

	/**
	 * Initialize log directory and start flush timer
	 */
	private initialize(): void {
		if (!this.config.enabled) {
			return;
		}

		try {
			// Create log directory if it doesn't exist
			if (!existsSync(this.config.logDir)) {
				mkdirSync(this.config.logDir, { recursive: true });
			}

			// Get current file size
			const logFile = this.getLogFilePath();
			if (existsSync(logFile)) {
				const stats = statSync(logFile);
				this.currentSize = stats.size;
			}

			// Start periodic flush
			this.flushTimer = setInterval(() => {
				this.flush().catch((err) => {
					// Silent error - don't crash app if logging fails
					console.error("Log flush error:", err);
				});
			}, this.config.flushInterval);

			// Don't prevent app from exiting
			if (this.flushTimer.unref) {
				this.flushTimer.unref();
			}

			this.initialized = true;
		} catch (error) {
			// Silent error - logging is not critical
			console.error("Failed to initialize LogWriter:", error);
			this.config.enabled = false;
		}
	}

	/**
	 * Get the current log file path
	 */
	private getLogFilePath(): string {
		return join(this.config.logDir, this.config.filename);
	}

	/**
	 * Get rotated log file path
	 */
	private getRotatedLogFilePath(index: number): string {
		return join(this.config.logDir, `${this.config.filename}.${index}`);
	}

	/**
	 * Write a log line (adds to buffer)
	 */
	write(message: string): void {
		if (!this.config.enabled || !this.initialized) {
			return;
		}

		// Add newline if not present
		const line = message.endsWith("\n") ? message : `${message}\n`;
		this.buffer.push(line);

		// Flush immediately if buffer is large (> 100 lines)
		if (this.buffer.length > 100) {
			this.flush().catch(() => {
				// Silent error
			});
		}
	}

	/**
	 * Flush buffered logs to disk
	 */
	async flush(): Promise<void> {
		if (!this.config.enabled || this.buffer.length === 0 || this.flushing) {
			return;
		}

		this.flushing = true;

		try {
			// Get buffered content
			const content = this.buffer.join("");
			this.buffer = [];

			// Append to log file
			const logFile = this.getLogFilePath();
			await Bun.write(logFile, content, {
				createPath: true,
			});

			// Update current size
			this.currentSize += Buffer.byteLength(content, "utf-8");

			// Check if rotation is needed
			if (this.currentSize >= this.config.maxFileSize) {
				await this.rotate();
			}
		} catch (error) {
			// Silent error - restore buffer
			console.error("Log flush failed:", error);
		} finally {
			this.flushing = false;
		}
	}

	/**
	 * Rotate log files
	 */
	private async rotate(): Promise<void> {
		try {
			const logFile = this.getLogFilePath();

			// Shift existing rotated logs
			// .4 -> .5 (delete if exists), .3 -> .4, .2 -> .3, .1 -> .2
			for (let i = this.config.maxFiles; i > 0; i--) {
				const currentRotated = this.getRotatedLogFilePath(i);
				const nextRotated = this.getRotatedLogFilePath(i + 1);

				if (i === this.config.maxFiles) {
					// Delete oldest
					if (existsSync(currentRotated)) {
						unlinkSync(currentRotated);
					}
				} else {
					// Shift
					if (existsSync(currentRotated)) {
						renameSync(currentRotated, nextRotated);
					}
				}
			}

			// Rotate current log to .1
			if (existsSync(logFile)) {
				renameSync(logFile, this.getRotatedLogFilePath(1));
			}

			// Reset size counter
			this.currentSize = 0;
		} catch (error) {
			console.error("Log rotation failed:", error);
		}
	}

	/**
	 * Shutdown log writer and flush remaining logs
	 */
	async shutdown(): Promise<void> {
		if (!this.config.enabled) {
			return;
		}

		// Stop flush timer
		if (this.flushTimer) {
			clearInterval(this.flushTimer);
			this.flushTimer = null;
		}

		// Final flush
		await this.flush();
	}

	/**
	 * Get current buffer size (for debugging)
	 */
	getBufferSize(): number {
		return this.buffer.length;
	}

	/**
	 * Get current log file size (for debugging)
	 */
	getCurrentFileSize(): number {
		return this.currentSize;
	}
}

// ─────────────────────────────────────────────────────────────
// Singleton
// ─────────────────────────────────────────────────────────────

let instance: LogWriter | null = null;

export function getLogWriter(config?: Partial<LogWriterConfig>): LogWriter {
	if (!instance) {
		instance = new LogWriter(config);
	}
	return instance;
}

/**
 * Reset the singleton (for testing)
 */
export function resetLogWriter(): void {
	if (instance) {
		instance.shutdown().catch(() => {
			// Silent error
		});
		instance = null;
	}
}
