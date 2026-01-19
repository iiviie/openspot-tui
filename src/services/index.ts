/**
 * Services re-exports
 */

export { AuthService, getAuthService, SPOTIFY_CLIENT_ID } from "./AuthService";
export {
	CacheKeys,
	CacheService,
	CacheTTL,
	getCacheService,
} from "./CacheService";
export { ConfigService, getConfigService } from "./ConfigService";

// MPRIS Service - conditionally use native or TypeScript implementation
// Set SPOTIFY_TUI_USE_NATIVE=0 to disable native module
const useNativeModule = process.env.SPOTIFY_TUI_USE_NATIVE !== "0";

export { MprisService } from "./MprisService";
export {
	NativeMprisAdapter,
	getNativeMprisAdapter,
} from "./NativeMprisAdapter";

// Export getMprisService based on configuration
// When native module is enabled, use the native adapter
// Otherwise, fall back to the TypeScript implementation
import { getMprisService as getTypescriptMprisService } from "./MprisService";
import { getNativeMprisAdapter } from "./NativeMprisAdapter";

export const getMprisService = useNativeModule
	? getNativeMprisAdapter
	: getTypescriptMprisService;

export { getSpotifyApiService, SpotifyApiService } from "./SpotifyApiService";
export type {
	InstallResult,
	InstallState,
	ProgressCallback,
	VerificationResult,
} from "./SpotifydInstaller";
export {
	getSpotifydInstaller,
	SpotifydInstaller,
} from "./SpotifydInstaller";
export type { SpotifydConfig, SpotifydStatus } from "./SpotifydManager";
export { getSpotifydManager, SpotifydManager } from "./SpotifydManager";

// New SpotifydService - uses Rust native module for process management
export type {
	SpotifydStatus as SpotifydServiceStatus,
	SpotifydStartResult,
	AuthResult,
} from "./SpotifydService";
export { SpotifydService, getSpotifydService } from "./SpotifydService";
export type { ErrorContext } from "./ErrorHandler";
export {
	ErrorHandler,
	ErrorCategory,
	ErrorSeverity,
	getErrorHandler,
	createErrorHandler,
} from "./ErrorHandler";
