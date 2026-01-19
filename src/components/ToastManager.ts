import {
	TOAST_MAX_WIDTH,
	TOAST_MIN_WIDTH,
	TOAST_WIDTH_PERCENT,
} from "../config/constants";
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
		const toast = new Toast(this.renderer, fullConfig, this.layout, x, y);

		// Add to queue
		this.toasts.push(toast);

		// Add to renderer immediately (renderables are created once)
		toast.addToRenderer();

		// Reposition all toasts
		this.repositionToasts();

		return id;
	}

	/**
	 * Show info toast
	 */
	info(title: string, message: string, duration: number = 3000): string {
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
	success(title: string, message: string, duration: number = 2000): string {
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
	warning(title: string, message: string, duration: number = 3000): string {
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
	error(title: string, message: string, duration: number = 4000): string {
		return this.show({
			type: "error",
			title,
			message,
			duration,
		});
	}

	/**
	 * Dismiss a toast by ID
	 */
	dismiss(id: string): void {
		const index = this.toasts.findIndex((t) => t.getId() === id);
		if (index === -1) return;

		// Dismiss toast (removes from renderer)
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
		// Dismiss all toasts (removes from renderer)
		for (const toast of this.toasts) {
			toast.dismiss();
		}

		this.toasts = [];
	}

	/**
	 * Calculate position for a new toast (top-right corner)
	 * Includes position clamping to ensure toast stays within bounds
	 */
	private calculatePosition(index: number): { x: number; y: number } {
		// Calculate responsive width (same formula as Toast)
		const dynamic = Math.floor(this.layout.termWidth * TOAST_WIDTH_PERCENT);
		const toastWidth = Math.max(
			TOAST_MIN_WIDTH,
			Math.min(TOAST_MAX_WIDTH, dynamic),
		);

		// Calculate X position with clamping to ensure it doesn't go off-screen
		const x = Math.max(
			0,
			this.layout.termWidth - toastWidth - this.toastMarginRight,
		);

		// Calculate Y based on stacking
		let y = this.toastMarginTop;

		// Add heights of all previous toasts
		for (let i = 0; i < index && i < this.toasts.length; i++) {
			y += this.toasts[i].getHeight() + this.toastSpacing;
		}

		// Clamp Y to ensure toast doesn't go below terminal
		y = Math.max(0, Math.min(y, this.layout.termHeight - 10));

		return { x, y };
	}

	/**
	 * Reposition all toasts (when one is dismissed)
	 */
	private repositionToasts(): void {
		let currentY = this.toastMarginTop;

		for (const toast of this.toasts) {
			toast.setY(currentY);
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
				// Toast was dismissed via Escape, remove it
				if (this.toasts[i].isDismissed()) {
					this.toasts.splice(i, 1);
					this.repositionToasts();
				}
				return true;
			}
		}
		return false;
	}

	/**
	 * Update loop - checks for auto-dismiss and cleans up
	 * Call this periodically (e.g., in the app's render loop)
	 */
	render(): void {
		// Check for auto-dismiss based on timestamps
		const toastsToRemove: number[] = [];
		for (let i = 0; i < this.toasts.length; i++) {
			if (this.toasts[i].shouldAutoDismiss()) {
				this.toasts[i].dismiss();
				toastsToRemove.push(i);
			}
		}

		// Remove auto-dismissed toasts (in reverse order to maintain indices)
		for (let i = toastsToRemove.length - 1; i >= 0; i--) {
			this.toasts.splice(toastsToRemove[i], 1);
		}

		// Reposition if any were removed
		if (toastsToRemove.length > 0) {
			this.repositionToasts();
		}

		// Clean up any manually dismissed toasts
		const beforeCount = this.toasts.length;
		this.toasts = this.toasts.filter((t) => !t.isDismissed());
		if (this.toasts.length !== beforeCount) {
			this.repositionToasts();
		}

		// Ensure all visible toasts are added to renderer
		const visibleToasts = this.toasts.slice(0, this.maxVisibleToasts);
		for (const toast of visibleToasts) {
			if (!toast.isAddedToRenderer()) {
				toast.addToRenderer();
			}
		}

		// Remove toasts beyond max visible from renderer (but keep in queue)
		for (let i = this.maxVisibleToasts; i < this.toasts.length; i++) {
			if (this.toasts[i].isAddedToRenderer()) {
				this.toasts[i].removeFromRenderer();
			}
		}
	}

	/**
	 * Update layout (for terminal resize)
	 * Recalculates positions and widths for all toasts
	 */
	updateLayout(layout: LayoutDimensions): void {
		this.layout = layout;

		// Recalculate responsive width
		const toastWidth = Math.min(
			60,
			Math.max(30, Math.floor(layout.termWidth * 0.35)),
		);
		const x = layout.termWidth - toastWidth - this.toastMarginRight;

		// Update each toast with new layout and position
		let currentY = this.toastMarginTop;
		for (const toast of this.toasts) {
			toast.updateLayout(layout, x, currentY);
			currentY += toast.getHeight() + this.toastSpacing;
		}
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
