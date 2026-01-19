/**
 * Logging Configuration
 * Centralized configuration for the logging system
 */

import { homedir } from "node:os";
import { join } from "node:path";

// LogLevel enum defined locally to avoid circular dependency
export enum LogLevel {
	DEBUG = 0,
	INFO = 1,
	WARN = 2,
	ERROR = 3,
	NONE = 4,
}

export interface LoggingConfig {
	/** Minimum log level to display/write */
	level: LogLevel;
	/** Whether to write logs to file */
	fileLogging: boolean;
	/** Whether to also output to console */
	consoleLogging: boolean;
	/** Maximum size of a single log file in bytes */
	maxFileSize: number;
	/** Maximum number of rotated log files to keep */
	maxFiles: number;
	/** Directory where log files are stored */
	logDir: string;
	/** Log output format */
	format: "text" | "json";
}

/**
 * Parse log level from environment variable or string
 */
function parseLogLevel(value: string | undefined): LogLevel {
	if (!value) return LogLevel.INFO;

	const level = value.toUpperCase();
	switch (level) {
		case "DEBUG":
			return LogLevel.DEBUG;
		case "INFO":
			return LogLevel.INFO;
		case "WARN":
			return LogLevel.WARN;
		case "ERROR":
			return LogLevel.ERROR;
		case "NONE":
			return LogLevel.NONE;
		default:
			return LogLevel.INFO;
	}
}

/**
 * Default logging configuration
 */
export const DEFAULT_LOGGING_CONFIG: LoggingConfig = {
	level: parseLogLevel(process.env.SPOTIFY_TUI_LOG_LEVEL),
	fileLogging: process.env.SPOTIFY_TUI_LOG_FILE !== "false",
	consoleLogging: process.env.SPOTIFY_TUI_LOG_CONSOLE === "true",
	maxFileSize: 5 * 1024 * 1024, // 5MB
	maxFiles: 5,
	logDir:
		process.env.SPOTIFY_TUI_LOG_DIR || join(homedir(), ".spotify-tui", "logs"),
	format: (process.env.SPOTIFY_TUI_LOG_FORMAT as "text" | "json") || "text",
};

/**
 * Get logging configuration (can be extended to read from config file)
 */
export function getLoggingConfig(): LoggingConfig {
	return { ...DEFAULT_LOGGING_CONFIG };
}
