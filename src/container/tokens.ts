/**
 * Dependency Injection Tokens
 * Use symbols to uniquely identify services for injection
 */

// ─────────────────────────────────────────────────────────────
// Core Services
// ─────────────────────────────────────────────────────────────

export const TOKENS = {
	// Configuration & Storage
	Config: Symbol("ConfigService"),
	Cache: Symbol("CacheService"),
	PersistentCache: Symbol("PersistentCacheService"),

	// Authentication & API
	Auth: Symbol("AuthService"),
	SpotifyApi: Symbol("SpotifyApiService"),

	// MPRIS & Playback
	Mpris: Symbol("MprisService"),
	MprisBridge: Symbol("MprisBridgeService"),
	NativeMprisAdapter: Symbol("NativeMprisAdapter"),

	// Spotifyd Management
	SpotifydManager: Symbol("SpotifydManager"),
	SpotifydInstaller: Symbol("SpotifydInstaller"),

	// Application Services
	Logger: Symbol("Logger"),
	EventBus: Symbol("EventBus"),
	ToastManager: Symbol("ToastManager"),

	// ─────────────────────────────────────────────────────────────
	// Controllers (Phase 1)
	// ─────────────────────────────────────────────────────────────

	PlaybackController: Symbol("PlaybackController"),
	NavigationController: Symbol("NavigationController"),
	AuthenticationController: Symbol("AuthenticationController"),
	ConnectionManager: Symbol("ConnectionManager"),
	MprisStateManager: Symbol("MprisStateManager"),
	InputHandler: Symbol("InputHandler"),
	AppLifecycle: Symbol("AppLifecycle"),

	// ─────────────────────────────────────────────────────────────
	// State & UI
	// ─────────────────────────────────────────────────────────────

	StateManager: Symbol("StateManager"),
	ErrorHandler: Symbol("ErrorHandler"),
} as const;

/**
 * Type-safe token type
 */
export type ServiceToken = (typeof TOKENS)[keyof typeof TOKENS];
