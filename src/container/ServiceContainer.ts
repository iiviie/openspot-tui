/**
 * Simple Dependency Injection Container
 * Manages service lifecycles and dependencies
 */

export type ServiceFactory<T> = () => T;

interface ServiceRegistration<T> {
	factory: ServiceFactory<T>;
	singleton: boolean;
	instance?: T;
}

/**
 * ServiceContainer for dependency injection
 * Supports both singleton and transient service lifetimes
 */
export class ServiceContainer {
	private services = new Map<symbol, ServiceRegistration<unknown>>();

	/**
	 * Register a transient service (new instance on each resolve)
	 */
	register<T>(token: symbol, factory: ServiceFactory<T>): void {
		this.services.set(token, {
			factory: factory as ServiceFactory<unknown>,
			singleton: false,
		});
	}

	/**
	 * Register a singleton service (same instance on each resolve)
	 */
	singleton<T>(token: symbol, factory: ServiceFactory<T>): void {
		this.services.set(token, {
			factory: factory as ServiceFactory<unknown>,
			singleton: true,
		});
	}

	/**
	 * Resolve a service by token
	 * @throws Error if service is not registered
	 */
	resolve<T>(token: symbol): T {
		const registration = this.services.get(token);

		if (!registration) {
			throw new Error(`Service not registered for token: ${token.toString()}`);
		}

		// Return existing instance for singletons
		if (registration.singleton && registration.instance) {
			return registration.instance as T;
		}

		// Create new instance
		const instance = registration.factory() as T;

		// Cache instance for singletons
		if (registration.singleton) {
			registration.instance = instance;
		}

		return instance;
	}

	/**
	 * Check if a service is registered
	 */
	has(token: symbol): boolean {
		return this.services.has(token);
	}

	/**
	 * Dispose all singleton instances that have a dispose method
	 */
	dispose(): void {
		for (const registration of this.services.values()) {
			if (registration.singleton && registration.instance) {
				const instance = registration.instance as any;
				if (typeof instance.dispose === "function") {
					instance.dispose();
				}
			}
		}
		this.services.clear();
	}
}

/**
 * Create a new service container
 */
export function createServiceContainer(): ServiceContainer {
	return new ServiceContainer();
}
