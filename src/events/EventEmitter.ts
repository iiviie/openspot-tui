/**
 * Type-Safe Event Emitter
 * Provides publish-subscribe pattern for state changes
 */

/**
 * Event listener function type
 */
export type EventListener<T = any> = (data: T) => void | Promise<void>;

/**
 * Event subscription handle for cleanup
 */
export interface EventSubscription {
	unsubscribe(): void;
}

/**
 * Type-safe event emitter with support for wildcard listeners
 */
export class EventEmitter<EventMap extends Record<string, any> = Record<string, any>> {
	private listeners = new Map<string, Set<EventListener>>();
	private onceListeners = new Map<string, Set<EventListener>>();

	/**
	 * Subscribe to an event
	 */
	on<K extends keyof EventMap>(
		event: K,
		listener: EventListener<EventMap[K]>,
	): EventSubscription {
		const eventName = event as string;

		if (!this.listeners.has(eventName)) {
			this.listeners.set(eventName, new Set());
		}

		this.listeners.get(eventName)!.add(listener);

		return {
			unsubscribe: () => this.off(event, listener),
		};
	}

	/**
	 * Subscribe to an event once (auto-unsubscribe after first emission)
	 */
	once<K extends keyof EventMap>(
		event: K,
		listener: EventListener<EventMap[K]>,
	): EventSubscription {
		const eventName = event as string;

		if (!this.onceListeners.has(eventName)) {
			this.onceListeners.set(eventName, new Set());
		}

		this.onceListeners.get(eventName)!.add(listener);

		return {
			unsubscribe: () => this.off(event, listener),
		};
	}

	/**
	 * Unsubscribe from an event
	 */
	off<K extends keyof EventMap>(
		event: K,
		listener: EventListener<EventMap[K]>,
	): void {
		const eventName = event as string;

		this.listeners.get(eventName)?.delete(listener);
		this.onceListeners.get(eventName)?.delete(listener);
	}

	/**
	 * Emit an event to all subscribers
	 */
	async emit<K extends keyof EventMap>(
		event: K,
		data: EventMap[K],
	): Promise<void> {
		const eventName = event as string;

		// Call regular listeners
		const listeners = this.listeners.get(eventName);
		if (listeners) {
			for (const listener of listeners) {
				try {
					await listener(data);
				} catch (error) {
					console.error(`Error in event listener for '${eventName}':`, error);
				}
			}
		}

		// Call once listeners and remove them
		const onceListeners = this.onceListeners.get(eventName);
		if (onceListeners) {
			for (const listener of onceListeners) {
				try {
					await listener(data);
				} catch (error) {
					console.error(`Error in once listener for '${eventName}':`, error);
				}
			}
			this.onceListeners.delete(eventName);
		}
	}

	/**
	 * Emit an event synchronously (non-blocking)
	 */
	emitSync<K extends keyof EventMap>(event: K, data: EventMap[K]): void {
		// Don't await - fire and forget
		this.emit(event, data).catch((error) => {
			console.error(`Error emitting '${String(event)}':`, error);
		});
	}

	/**
	 * Remove all listeners for an event
	 */
	removeAllListeners<K extends keyof EventMap>(event?: K): void {
		if (event) {
			const eventName = event as string;
			this.listeners.delete(eventName);
			this.onceListeners.delete(eventName);
		} else {
			this.listeners.clear();
			this.onceListeners.clear();
		}
	}

	/**
	 * Get number of listeners for an event
	 */
	listenerCount<K extends keyof EventMap>(event: K): number {
		const eventName = event as string;
		const regular = this.listeners.get(eventName)?.size ?? 0;
		const once = this.onceListeners.get(eventName)?.size ?? 0;
		return regular + once;
	}

	/**
	 * Get all event names that have listeners
	 */
	eventNames(): string[] {
		const names = new Set<string>();
		for (const name of this.listeners.keys()) {
			names.add(name);
		}
		for (const name of this.onceListeners.keys()) {
			names.add(name);
		}
		return Array.from(names);
	}
}

/**
 * Create a typed event emitter
 */
export function createEventEmitter<
	EventMap extends Record<string, any> = Record<string, any>,
>(): EventEmitter<EventMap> {
	return new EventEmitter<EventMap>();
}
