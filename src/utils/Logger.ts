/**
 * Logger Service
 * Centralized logging with levels, timestamps, contexts, and file persistence
 */

import { getLogWriter, type LogWriter } from "./LogWriter";
import { getLoggingConfig, LogLevel } from "../config/logging";

export { LogLevel } from "../config/logging";

export interface LoggerConfig {
	level: LogLevel;
	enableTimestamps: boolean;
	enableColors: boolean;
	enableFileLogging: boolean;
	enableConsoleLogging: boolean;
}

// Get config from centralized logging config
const loggingConfig = getLoggingConfig();

const DEFAULT_CONFIG: LoggerConfig = {
	level: loggingConfig.level,
	enableTimestamps: true,
	enableColors: true,
	enableFileLogging: loggingConfig.fileLogging,
	enableConsoleLogging: loggingConfig.consoleLogging,
};

/**
 * ANSI color codes for terminal output
 */
const colors = {
	reset: "\x1b[0m",
	dim: "\x1b[2m",
	red: "\x1b[31m",
	yellow: "\x1b[33m",
	blue: "\x1b[34m",
	cyan: "\x1b[36m",
	gray: "\x1b[90m",
};

/**
 * Logger class with support for different log levels and contexts
 */
export class Logger {
	private config: LoggerConfig;
	private context: string;
	private logWriter: LogWriter | null = null;

	constructor(context: string = "App", config: Partial<LoggerConfig> = {}) {
		this.context = context;
		this.config = { ...DEFAULT_CONFIG, ...config };

		// Initialize file logging if enabled
		if (this.config.enableFileLogging) {
			try {
				this.logWriter = getLogWriter();
			} catch {
				// Silent error - file logging is non-critical
			}
		}
	}

	/**
	 * Create a child logger with a different context
	 */
	child(context: string): Logger {
		return new Logger(context, this.config);
	}

	/**
	 * Set the minimum log level
	 */
	setLevel(level: LogLevel): void {
		this.config.level = level;
	}

	/**
	 * Format log message with timestamp and context (with colors for console)
	 */
	private format(
		level: string,
		message: string,
		color: string,
		data?: unknown,
	): string {
		const parts: string[] = [];

		// Timestamp
		if (this.config.enableTimestamps) {
			const timestamp = new Date().toISOString().split("T")[1].slice(0, 12);
			if (this.config.enableColors) {
				parts.push(`${colors.gray}[${timestamp}]${colors.reset}`);
			} else {
				parts.push(`[${timestamp}]`);
			}
		}

		// Level
		if (this.config.enableColors) {
			parts.push(`${color}${level.padEnd(5)}${colors.reset}`);
		} else {
			parts.push(level.padEnd(5));
		}

		// Context
		if (this.config.enableColors) {
			parts.push(`${colors.cyan}[${this.context}]${colors.reset}`);
		} else {
			parts.push(`[${this.context}]`);
		}

		// Message
		parts.push(message);

		// Data
		if (data !== undefined) {
			const dataStr =
				typeof data === "object" ? JSON.stringify(data, null, 2) : String(data);
			if (this.config.enableColors) {
				parts.push(`\n${colors.dim}${dataStr}${colors.reset}`);
			} else {
				parts.push(`\n${dataStr}`);
			}
		}

		return parts.join(" ");
	}

	/**
	 * Format log message with timestamp and context (without colors for file logging)
	 */
	private formatPlain(level: string, message: string, data?: unknown): string {
		const parts: string[] = [];

		// Full ISO timestamp for file logs
		const timestamp = new Date().toISOString();
		parts.push(timestamp);

		// Level
		parts.push(`[${level}]`);

		// Context
		parts.push(`[${this.context}]`);

		// Message
		parts.push(message);

		// Data
		if (data !== undefined) {
			const dataStr =
				typeof data === "object" ? JSON.stringify(data) : String(data);
			parts.push(dataStr);
		}

		return parts.join(" ");
	}

	/**
	 * Log to both console and file
	 */
	private log(
		level: LogLevel,
		levelStr: string,
		color: string,
		message: string,
		data?: unknown,
	): void {
		// Short-circuit if level is too low
		if (this.config.level > level) return;

		// Format for console (with colors)
		const consoleMessage = this.format(levelStr, message, color, data);

		// Write to console if enabled
		if (this.config.enableConsoleLogging) {
			const consoleMethod =
				level === LogLevel.ERROR
					? console.error
					: level === LogLevel.WARN
						? console.warn
						: console.log;
			consoleMethod(consoleMessage);
		}

		// Write to file if enabled (without colors)
		if (this.config.enableFileLogging && this.logWriter) {
			const plainMessage = this.formatPlain(levelStr, message, data);
			this.logWriter.write(plainMessage);
		}
	}

	/**
	 * Debug log (lowest priority)
	 */
	debug(message: string, data?: unknown): void {
		this.log(LogLevel.DEBUG, "DEBUG", colors.gray, message, data);
	}

	/**
	 * Info log (normal priority)
	 */
	info(message: string, data?: unknown): void {
		this.log(LogLevel.INFO, "INFO", colors.blue, message, data);
	}

	/**
	 * Warning log (medium priority)
	 */
	warn(message: string, data?: unknown): void {
		this.log(LogLevel.WARN, "WARN", colors.yellow, message, data);
	}

	/**
	 * Error log (highest priority)
	 */
	error(message: string, error?: unknown): void {
		let errorData: unknown = error;

		// Extract useful info from Error objects
		if (error instanceof Error) {
			errorData = {
				name: error.name,
				message: error.message,
				stack: error.stack,
			};
		}

		this.log(LogLevel.ERROR, "ERROR", colors.red, message, errorData);
	}

	/**
	 * Always log (ignores log level)
	 */
	always(message: string, data?: unknown): void {
		// Always log to console
		const formatted = this.format("LOG", message, colors.reset, data);
		console.log(formatted);

		// Also write to file
		if (this.config.enableFileLogging && this.logWriter) {
			const plainMessage = this.formatPlain("LOG", message, data);
			this.logWriter.write(plainMessage);
		}
	}
}

// Global logger instance
let globalLogger: Logger | null = null;

/**
 * Get or create the global logger instance
 */
export function getLogger(context?: string): Logger {
	if (context) {
		// Create a child logger with specific context
		if (!globalLogger) {
			globalLogger = new Logger("App");
		}
		return globalLogger.child(context);
	}

	// Return or create global logger
	if (!globalLogger) {
		globalLogger = new Logger("App");
	}
	return globalLogger;
}

/**
 * Configure the global logger
 */
export function configureLogger(config: Partial<LoggerConfig>): void {
	if (!globalLogger) {
		globalLogger = new Logger("App", config);
	} else {
		globalLogger = new Logger("App", config);
	}
}
