import { getLogger } from "../utils";
import type { ToastManager } from "../components";

const logger = getLogger("ErrorHandler");

/**
 * Error severity levels
 */
export enum ErrorSeverity {
	/** Info - non-blocking, informational */
	INFO = "info",
	/** Warning - degraded functionality but app continues */
	WARNING = "warning",
	/** Error - feature broken but app recoverable */
	ERROR = "error",
	/** Fatal - app must exit */
	FATAL = "fatal",
}

/**
 * Error categories for classification
 */
export enum ErrorCategory {
	/** Authentication errors (token expired, etc.) */
	AUTH = "auth",
	/** Network/API errors */
	NETWORK = "network",
	/** MPRIS/D-Bus errors */
	MPRIS = "mpris",
	/** Spotifyd errors */
	SPOTIFYD = "spotifyd",
	/** File system errors */
	FS = "fs",
	/** Validation errors */
	VALIDATION = "validation",
	/** Unknown errors */
	UNKNOWN = "unknown",
}

/**
 * Error context for additional information
 */
export interface ErrorContext {
	category: ErrorCategory;
	severity: ErrorSeverity;
	operation?: string; // What was being attempted
	metadata?: Record<string, unknown>; // Additional context
	recoverable?: boolean; // Can the error be recovered from?
	userMessage?: string; // User-friendly message
}

/**
 * Recovery strategy function
 */
type RecoveryStrategy = (
	error: Error,
	context: ErrorContext,
) => Promise<void> | void;

/**
 * Centralized Error Handler
 * Provides consistent error handling, logging, user feedback, and recovery strategies
 */
export class ErrorHandler {
	private recoveryStrategies: Map<ErrorCategory, RecoveryStrategy[]> =
		new Map();

	constructor(private toastManager?: ToastManager) {
		this.initializeDefaultStrategies();
	}

	/**
	 * Initialize default recovery strategies
	 */
	private initializeDefaultStrategies(): void {
		// Auth recovery: Prompt for re-authentication
		this.registerRecoveryStrategy(
			ErrorCategory.AUTH,
			async (error, context) => {
				logger.warn("Auth error detected:", error.message);
				this.toastManager?.show({
					type: "warning",
					title: "Authentication Required",
					message:
						context.userMessage ||
						"Please re-authenticate using Ctrl+P → 'Authenticate with Spotify'",
					duration: 5000,
				});
			},
		);

		// Network recovery: Retry with exponential backoff (handled by caller)
		this.registerRecoveryStrategy(ErrorCategory.NETWORK, (error, context) => {
			logger.warn("Network error:", error.message);
			if (context.severity === ErrorSeverity.ERROR) {
				this.toastManager?.show({
					type: "error",
					title: "Network Error",
					message: context.userMessage || "Failed to connect to Spotify API",
					duration: 3000,
				});
			}
		});

		// MPRIS recovery: Attempt reconnection
		this.registerRecoveryStrategy(ErrorCategory.MPRIS, (error, context) => {
			logger.warn("MPRIS error:", error.message);
			if (context.severity === ErrorSeverity.ERROR) {
				this.toastManager?.show({
					type: "warning",
					title: "MPRIS Connection Lost",
					message:
						context.userMessage || "Will attempt to reconnect automatically",
					duration: 3000,
				});
			}
		});

		// Spotifyd recovery: Check if running, prompt to start
		this.registerRecoveryStrategy(ErrorCategory.SPOTIFYD, (error, context) => {
			logger.warn("Spotifyd error:", error.message);
			this.toastManager?.show({
				type: "warning",
				title: "Spotifyd Not Running",
				message:
					context.userMessage || "Use Ctrl+P → 'Start Spotifyd' to launch",
				duration: 5000,
			});
		});
	}

	/**
	 * Register a recovery strategy for a specific error category
	 */
	registerRecoveryStrategy(
		category: ErrorCategory,
		strategy: RecoveryStrategy,
	): void {
		if (!this.recoveryStrategies.has(category)) {
			this.recoveryStrategies.set(category, []);
		}
		this.recoveryStrategies.get(category)!.push(strategy);
	}

	/**
	 * Handle an error with context
	 */
	async handle(error: Error | unknown, context: ErrorContext): Promise<void> {
		const err = this.normalizeError(error);

		// Log based on severity
		this.logError(err, context);

		// Execute recovery strategies
		if (context.recoverable !== false) {
			await this.executeRecoveryStrategies(err, context);
		}

		// Show user feedback if severe enough
		if (
			context.severity === ErrorSeverity.ERROR ||
			context.severity === ErrorSeverity.FATAL
		) {
			this.showUserFeedback(err, context);
		}

		// Fatal errors should terminate
		if (context.severity === ErrorSeverity.FATAL) {
			logger.error("Fatal error - application will exit:", err);
			process.exit(1);
		}
	}

	/**
	 * Normalize unknown errors to Error objects
	 */
	private normalizeError(error: unknown): Error {
		if (error instanceof Error) {
			return error;
		}
		if (typeof error === "string") {
			return new Error(error);
		}
		return new Error(String(error));
	}

	/**
	 * Log error based on severity
	 */
	private logError(error: Error, context: ErrorContext): void {
		const logMessage = `[${context.category}] ${context.operation || "Unknown operation"}: ${error.message}`;

		switch (context.severity) {
			case ErrorSeverity.INFO:
				logger.info(logMessage, context.metadata);
				break;
			case ErrorSeverity.WARNING:
				logger.warn(logMessage, context.metadata);
				break;
			case ErrorSeverity.ERROR:
				logger.error(logMessage, context.metadata);
				break;
			case ErrorSeverity.FATAL:
				logger.error(`FATAL: ${logMessage}`, context.metadata);
				break;
		}
	}

	/**
	 * Execute all recovery strategies for an error category
	 */
	private async executeRecoveryStrategies(
		error: Error,
		context: ErrorContext,
	): Promise<void> {
		const strategies = this.recoveryStrategies.get(context.category);
		if (!strategies || strategies.length === 0) {
			return;
		}

		for (const strategy of strategies) {
			try {
				await strategy(error, context);
			} catch (recoveryError) {
				logger.error("Recovery strategy failed:", recoveryError);
			}
		}
	}

	/**
	 * Show user feedback via toast
	 */
	private showUserFeedback(error: Error, context: ErrorContext): void {
		if (!this.toastManager) return;

		const type = context.severity === ErrorSeverity.FATAL ? "error" : "warning";
		const title = context.userMessage || this.getDefaultTitle(context.category);

		this.toastManager.show({
			type,
			title,
			message: error.message,
			duration: context.severity === ErrorSeverity.FATAL ? null : 5000,
		});
	}

	/**
	 * Get default title for error category
	 */
	private getDefaultTitle(category: ErrorCategory): string {
		switch (category) {
			case ErrorCategory.AUTH:
				return "Authentication Error";
			case ErrorCategory.NETWORK:
				return "Network Error";
			case ErrorCategory.MPRIS:
				return "MPRIS Error";
			case ErrorCategory.SPOTIFYD:
				return "Spotifyd Error";
			case ErrorCategory.FS:
				return "File System Error";
			case ErrorCategory.VALIDATION:
				return "Validation Error";
			default:
				return "Error";
		}
	}

	/**
	 * Helper: Handle network errors
	 */
	async handleNetworkError(error: unknown, operation: string): Promise<void> {
		await this.handle(error, {
			category: ErrorCategory.NETWORK,
			severity: ErrorSeverity.ERROR,
			operation,
			recoverable: true,
		});
	}

	/**
	 * Helper: Handle auth errors
	 */
	async handleAuthError(error: unknown, operation: string): Promise<void> {
		await this.handle(error, {
			category: ErrorCategory.AUTH,
			severity: ErrorSeverity.ERROR,
			operation,
			recoverable: true,
			userMessage: "Authentication required - please log in",
		});
	}

	/**
	 * Helper: Handle MPRIS errors
	 */
	async handleMprisError(
		error: unknown,
		operation: string,
		recoverable = true,
	): Promise<void> {
		await this.handle(error, {
			category: ErrorCategory.MPRIS,
			severity: recoverable ? ErrorSeverity.WARNING : ErrorSeverity.ERROR,
			operation,
			recoverable,
		});
	}

	/**
	 * Helper: Handle spotifyd errors
	 */
	async handleSpotifydError(error: unknown, operation: string): Promise<void> {
		await this.handle(error, {
			category: ErrorCategory.SPOTIFYD,
			severity: ErrorSeverity.WARNING,
			operation,
			recoverable: true,
		});
	}

	/**
	 * Helper: Log warning (non-blocking)
	 */
	logWarning(
		message: string,
		category: ErrorCategory = ErrorCategory.UNKNOWN,
	): void {
		this.handle(new Error(message), {
			category,
			severity: ErrorSeverity.WARNING,
			recoverable: true,
		});
	}

	/**
	 * Helper: Log info
	 */
	logInfo(
		message: string,
		category: ErrorCategory = ErrorCategory.UNKNOWN,
	): void {
		this.handle(new Error(message), {
			category,
			severity: ErrorSeverity.INFO,
			recoverable: true,
		});
	}

	/**
	 * Dispose and cleanup (remove all recovery strategies)
	 */
	dispose(): void {
		this.recoveryStrategies.clear();
	}
}

/**
 * Singleton instance
 */
let instance: ErrorHandler | null = null;

/**
 * Get or create ErrorHandler instance
 */
export function getErrorHandler(toastManager?: ToastManager): ErrorHandler {
	if (!instance) {
		instance = new ErrorHandler(toastManager);
	} else if (toastManager && !instance["toastManager"]) {
		// Update toast manager if not set
		instance["toastManager"] = toastManager;
	}
	return instance;
}

/**
 * Create a new ErrorHandler instance (for testing)
 */
export function createErrorHandler(toastManager?: ToastManager): ErrorHandler {
	return new ErrorHandler(toastManager);
}
