import type { CliRenderer, LayoutDimensions } from "../types";
import { Toast, type ToastConfig } from "./Toast";

/**
 * Toast Manager
 * Manages multiple toast notifications with queue, auto-dismiss, and stacking
 */
export class ToastManager {
	private renderer: CliRenderer;
	private layout: LayoutDimensions;
	private toasts: Toast[] = [];
	private timers: Map<string, Timer> = new Map();
	private maxVisibleToasts: number = 4;
	private toastSpacing: number = 1; // Space between stacked toasts
	private toastMarginRight: number = 2; // Margin from right edge
	private toastMarginTop: number = 2; // Margin from top edge

	constructor(renderer: CliRenderer, layout: LayoutDimensions) {
		this.renderer = renderer;
		this.layout = layout;
	}

	/**
	 * Show a toast notification
	 */
	show(config: Omit<ToastConfig, "id">): string {
		// Generate unique ID
		const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

		const fullConfig: ToastConfig = {
			...config,
			id,
		};

		// Create toast
		const { x, y } = this.calculatePosition(this.toasts.length);
		const toast = new Toast(this.renderer, fullConfig, x, y);

		// Add to queue
		this.toasts.push(toast);

		// Reposition all toasts
		this.repositionToasts();

		// Set up auto-dismiss if duration specified
		if (fullConfig.duration !== null && fullConfig.duration !== undefined) {
			const timer = setTimeout(() => {
				this.dismiss(id);
			}, fullConfig.duration);
			this.timers.set(id, timer);
		}

		return id;
	}

	/**
	 * Show info toast
	 */
	info(title: string, message: string, duration: number = 5000): string {
		return this.show({
			type: "info",
			title,
			message,
			duration,
		});
	}

	/**
	 * Show success toast
	 */
	success(title: string, message: string, duration: number = 3000): string {
		return this.show({
			type: "success",
			title,
			message,
			duration,
		});
	}

	/**
	 * Show warning toast
	 */
	warning(title: string, message: string, duration: number = 5000): string {
		return this.show({
			type: "warning",
			title,
			message,
			duration,
		});
	}

	/**
	 * Show error toast
	 */
	error(title: string, message: string, duration: number = 5000): string {
		return this.show({
			type: "error",
			title,
			message,
			duration,
		});
	}

	/**
	 * Show action toast (persistent by default)
	 */
	action(
		title: string,
		message: string,
		config?: Partial<Pick<ToastConfig, "url" | "actions" | "duration">>,
	): string {
		return this.show({
			type: "action",
			title,
			message,
			duration: null, // Persistent by default
			...config,
		});
	}

	/**
	 * Dismiss a toast by ID
	 */
	dismiss(id: string): void {
		const index = this.toasts.findIndex((t) => t.getId() === id);
		if (index === -1) return;

		// Clear timer
		const timer = this.timers.get(id);
		if (timer) {
			clearTimeout(timer);
			this.timers.delete(id);
		}

		// Dismiss toast
		this.toasts[index].dismiss();

		// Remove from array
		this.toasts.splice(index, 1);

		// Reposition remaining toasts
		this.repositionToasts();
	}

	/**
	 * Dismiss all toasts
	 */
	dismissAll(): void {
		// Clear all timers
		for (const timer of this.timers.values()) {
			clearTimeout(timer);
		}
		this.timers.clear();

		// Dismiss all toasts
		for (const toast of this.toasts) {
			toast.dismiss();
		}

		this.toasts = [];
	}

	/**
	 * Calculate position for a new toast (top-right corner)
	 */
	private calculatePosition(index: number): { x: number; y: number } {
		const toastWidth = 45;
		const x = this.layout.termWidth - toastWidth - this.toastMarginRight;

		// Calculate Y based on stacking
		let y = this.toastMarginTop;

		// Add heights of all previous toasts
		for (let i = 0; i < index && i < this.toasts.length; i++) {
			y += this.toasts[i].getHeight() + this.toastSpacing;
		}

		return { x, y };
	}

	/**
	 * Reposition all toasts (when one is dismissed)
	 */
	private repositionToasts(): void {
		let currentY = this.toastMarginTop;

		for (const toast of this.toasts) {
			const toastWidth = 45;
			const x = this.layout.termWidth - toastWidth - this.toastMarginRight;
			toast.updatePosition(currentY);
			currentY += toast.getHeight() + this.toastSpacing;
		}
	}

	/**
	 * Handle keyboard input
	 * Returns true if input was handled by a toast
	 */
	handleInput(key: string): boolean {
		// Check toasts in reverse order (top-most first)
		for (let i = this.toasts.length - 1; i >= 0; i--) {
			if (this.toasts[i].handleInput(key)) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Render all visible toasts
	 */
	render(): void {
		// Clean up dismissed toasts
		this.toasts = this.toasts.filter((t) => !t.isDismissed());

		// Render visible toasts (limit to max)
		const visibleToasts = this.toasts.slice(0, this.maxVisibleToasts);
		for (const toast of visibleToasts) {
			toast.render();
		}
	}

	/**
	 * Update layout (for terminal resize)
	 */
	updateLayout(layout: LayoutDimensions): void {
		this.layout = layout;
		this.repositionToasts();
	}

	/**
	 * Get number of active toasts
	 */
	getToastCount(): number {
		return this.toasts.length;
	}

	/**
	 * Check if a specific toast exists
	 */
	hasToast(id: string): boolean {
		return this.toasts.some((t) => t.getId() === id);
	}
}

// Singleton instance
let instance: ToastManager | null = null;

export function getToastManager(
	renderer: CliRenderer,
	layout: LayoutDimensions,
): ToastManager {
	if (!instance) {
		instance = new ToastManager(renderer, layout);
	}
	return instance;
}

/**
 * Reset singleton (for testing)
 */
export function resetToastManager(): void {
	if (instance) {
		instance.dismissAll();
	}
	instance = null;
}
