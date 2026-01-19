import { App } from "./app";
import {
	createServiceContainer,
	registerServices,
	validateServiceRegistration,
} from "./container";
import { getLogger } from "./utils";

const logger = getLogger("Main");

/**
 * Main entry point
 * Sets up DI container and starts the application
 */
async function main() {
	try {
		// Create and configure DI container
		const container = createServiceContainer();

		// Register all services (bridges singleton pattern with DI)
		registerServices(container);

		// Validate all required services are registered
		if (!validateServiceRegistration(container)) {
			logger.error("Service registration validation failed");
			process.exit(1);
		}

		logger.debug("DI container initialized and validated");

		// Create and start application
		const app = new App();
		await app.start();
	} catch (error) {
		logger.error("Fatal error in main:", error);
		process.exit(1);
	}
}

// Start the application
main();
