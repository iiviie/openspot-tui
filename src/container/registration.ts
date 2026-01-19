/**
 * Service Registration
 * Registers all services with the DI container
 *
 * This bridges the gap between singleton pattern and DI:
 * - Existing code can still use getXService()
 * - New code can use container.resolve(TOKENS.X)
 * - Gradual migration path
 */

import { TOKENS, type ServiceContainer } from "../container";
import { getConfigService } from "../services/ConfigService";
import { getCacheService } from "../services/CacheService";
import { getPersistentCache } from "../services/PersistentCacheService";
import { getAuthService } from "../services/AuthService";
import { getSpotifyApiService } from "../services";
import { getMprisService } from "../services";
import { getSpotifydService } from "../services";
import { getLogger } from "../utils";

const logger = getLogger("ServiceRegistration");

/**
 * Register all services with the DI container
 * Uses existing singleton getters to maintain compatibility
 */
export function registerServices(container: ServiceContainer): void {
	logger.debug("Registering services with DI container...");

	// Core Services (no dependencies)
	container.singleton(TOKENS.Config, () => getConfigService());
	container.singleton(TOKENS.Cache, () => getCacheService());
	container.singleton(TOKENS.PersistentCache, () => getPersistentCache());

	// Authentication & API (depend on core services)
	container.singleton(TOKENS.Auth, () => getAuthService());
	container.singleton(TOKENS.SpotifyApi, () => getSpotifyApiService());

	// MPRIS & Spotifyd
	container.singleton(TOKENS.Mpris, () => getMprisService());
	container.singleton(TOKENS.SpotifydService, () => getSpotifydService());

	logger.debug("Service registration complete");
}

/**
 * Check if all required services are registered
 */
export function validateServiceRegistration(
	container: ServiceContainer,
): boolean {
	const requiredTokens = [
		TOKENS.Config,
		TOKENS.Cache,
		TOKENS.PersistentCache,
		TOKENS.Auth,
		TOKENS.SpotifyApi,
		TOKENS.Mpris,
		TOKENS.SpotifydService,
	];

	for (const token of requiredTokens) {
		if (!container.has(token)) {
			logger.error(`Missing required service: ${token.toString()}`);
			return false;
		}
	}

	return true;
}
