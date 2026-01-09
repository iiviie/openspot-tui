/**
 * Logger Service
 * Centralized logging with levels, timestamps, and contexts
 */

export enum LogLevel {
	DEBUG = 0,
	INFO = 1,
	WARN = 2,
	ERROR = 3,
	NONE = 4,
}

export interface LoggerConfig {
	level: LogLevel;
	enableTimestamps: boolean;
	enableColors: boolean;
}

const DEFAULT_CONFIG: LoggerConfig = {
	level: LogLevel.INFO,
	enableTimestamps: true,
	enableColors: true,
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

	constructor(context: string = "App", config: Partial<LoggerConfig> = {}) {
		this.context = context;
		this.config = { ...DEFAULT_CONFIG, ...config };
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
	 * Format log message with timestamp and context
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
				typeof data === "object"
					? JSON.stringify(data, null, 2)
					: String(data);
			if (this.config.enableColors) {
				parts.push(`\n${colors.dim}${dataStr}${colors.reset}`);
			} else {
				parts.push(`\n${dataStr}`);
			}
		}

		return parts.join(" ");
	}

	/**
	 * Debug log (lowest priority)
	 */
	debug(message: string, data?: unknown): void {
		if (this.config.level <= LogLevel.DEBUG) {
			console.log(this.format("DEBUG", message, colors.gray, data));
		}
	}

	/**
	 * Info log (normal priority)
	 */
	info(message: string, data?: unknown): void {
		if (this.config.level <= LogLevel.INFO) {
			console.log(this.format("INFO", message, colors.blue, data));
		}
	}

	/**
	 * Warning log (medium priority)
	 */
	warn(message: string, data?: unknown): void {
		if (this.config.level <= LogLevel.WARN) {
			console.warn(this.format("WARN", message, colors.yellow, data));
		}
	}

	/**
	 * Error log (highest priority)
	 */
	error(message: string, error?: unknown): void {
		if (this.config.level <= LogLevel.ERROR) {
			let errorData: unknown = error;

			// Extract useful info from Error objects
			if (error instanceof Error) {
				errorData = {
					name: error.name,
					message: error.message,
					stack: error.stack,
				};
			}

			console.error(this.format("ERROR", message, colors.red, errorData));
		}
	}

	/**
	 * Always log (ignores log level)
	 */
	always(message: string, data?: unknown): void {
		console.log(this.format("LOG", message, colors.reset, data));
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
