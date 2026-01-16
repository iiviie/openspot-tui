import { BoxRenderable, TextRenderable } from "@opentui/core";
import { colors } from "../config/colors";
import type { CliRenderer } from "../types";

/**
 * Toast notification types
 */
export type ToastType = "info" | "success" | "warning" | "error" | "action";

/**
 * Toast configuration
 */
export interface ToastConfig {
	id: string;
	type: ToastType;
	title: string;
	message: string;
	duration?: number | null; // Auto-dismiss duration (ms), null = persistent
	dismissable?: boolean; // Can be manually dismissed (default: true)
	onDismiss?: () => void; // Callback when dismissed
}

/**
 * Toast notification component
 * Creates renderables ONCE and updates them as needed (like CommandPalette)
 */
export class Toast {
	private renderer: CliRenderer;
	private config: ToastConfig;
	private x: number;
	private y: number;
	private width: number = 45;
	private height: number = 0;

	private createdAt: number;
	private dismissed: boolean = false;
	private addedToRenderer: boolean = false;

	// Renderables - created once, reused
	private container: BoxRenderable;
	private titleLabel: TextRenderable;
	private messageLabel: TextRenderable;

	constructor(
		renderer: CliRenderer,
		config: ToastConfig,
		x: number,
		y: number,
	) {
		this.renderer = renderer;
		this.config = {
			dismissable: true,
			...config,
		};
		this.x = x;
		this.y = y;
		this.createdAt = Date.now();

		// Calculate height before creating renderables
		this.calculateHeight();

		// Create renderables ONCE in constructor
		this.container = this.createContainer();
		this.titleLabel = this.createTitleLabel();
		this.messageLabel = this.createMessageLabel();
	}

	/**
	 * Calculate toast height based on content
	 */
	private calculateHeight(): void {
		let height = 3; // Border + title
		const maxLineWidth = this.width - 4;
		const messageLines = this.wrapText(this.config.message, maxLineWidth);
		height += messageLines.length;
		this.height = height;
	}

	/**
	 * Wrap text to fit within max width
	 */
	private wrapText(text: string, maxWidth: number): string[] {
		const words = text.split(" ");
		const lines: string[] = [];
		let currentLine = "";

		for (const word of words) {
			const testLine = currentLine ? `${currentLine} ${word}` : word;
			if (testLine.length <= maxWidth) {
				currentLine = testLine;
			} else {
				if (currentLine) lines.push(currentLine);
				currentLine = word;
			}
		}
		if (currentLine) lines.push(currentLine);

		return lines;
	}

	/**
	 * Get border color based on toast type
	 */
	private getBorderColor(): string {
		switch (this.config.type) {
			case "info":
			case "action":
				return colors.accent;
			case "success":
				return colors.success;
			case "warning":
				return colors.warning;
			case "error":
				return colors.error;
		}
	}

	/**
	 * Get icon based on toast type
	 */
	private getIcon(): string {
		switch (this.config.type) {
			case "info":
				return "i";
			case "success":
				return "+";
			case "warning":
				return "!";
			case "error":
				return "x";
			case "action":
				return ">";
		}
	}

	/**
	 * Create the container box renderable
	 */
	private createContainer(): BoxRenderable {
		return new BoxRenderable(this.renderer, {
			id: `toast-${this.config.id}`,
			position: "absolute",
			left: this.x,
			top: this.y,
			width: this.width,
			height: this.height,
			borderColor: this.getBorderColor(),
			borderStyle: "single",
			backgroundColor: colors.bgSecondary,
		});
	}

	/**
	 * Create the title label renderable
	 */
	private createTitleLabel(): TextRenderable {
		const icon = this.getIcon();
		return new TextRenderable(this.renderer, {
			id: `toast-${this.config.id}-title`,
			content: `${icon} ${this.config.title}`,
			fg: this.getBorderColor(),
			position: "absolute",
			left: this.x + 2,
			top: this.y + 1,
		});
	}

	/**
	 * Create the message label renderable
	 */
	private createMessageLabel(): TextRenderable {
		const messageLines = this.wrapText(this.config.message, this.width - 4);
		const messageContent = messageLines.join("\n");
		return new TextRenderable(this.renderer, {
			id: `toast-${this.config.id}-message`,
			content: messageContent,
			fg: colors.textPrimary,
			position: "absolute",
			left: this.x + 2,
			top: this.y + 2,
		});
	}

	/**
	 * Check if toast should be auto-dismissed based on duration
	 */
	shouldAutoDismiss(): boolean {
		if (this.config.duration === null || this.config.duration === undefined) {
			return false;
		}
		return Date.now() - this.createdAt >= this.config.duration;
	}

	/**
	 * Add renderables to the renderer tree (call once)
	 */
	addToRenderer(): void {
		if (this.addedToRenderer || this.dismissed) return;

		this.renderer.root.add(this.container);
		this.renderer.root.add(this.titleLabel);
		this.renderer.root.add(this.messageLabel);
		this.addedToRenderer = true;
	}

	/**
	 * Remove renderables from the renderer tree
	 */
	removeFromRenderer(): void {
		if (!this.addedToRenderer) return;

		try {
			this.renderer.root.remove(`toast-${this.config.id}`);
			this.renderer.root.remove(`toast-${this.config.id}-title`);
			this.renderer.root.remove(`toast-${this.config.id}-message`);
		} catch {
			// Elements might not exist
		}
		this.addedToRenderer = false;
	}

	/**
	 * Update positions (for stacking) - updates existing renderables
	 */
	updatePosition(): void {
		if (!this.addedToRenderer) return;

		// Update positions using the renderable properties
		(this.container as any).left = this.x;
		(this.container as any).top = this.y;
		(this.titleLabel as any).left = this.x + 2;
		(this.titleLabel as any).top = this.y + 1;
		(this.messageLabel as any).left = this.x + 2;
		(this.messageLabel as any).top = this.y + 2;
	}

	/**
	 * Handle keyboard input
	 */
	handleInput(key: string): boolean {
		if (this.config.dismissable && key === "escape") {
			this.dismiss();
			return true;
		}
		return false;
	}

	/**
	 * Dismiss the toast
	 */
	dismiss(): void {
		if (this.dismissed) return;

		this.dismissed = true;
		this.removeFromRenderer();
		this.config.onDismiss?.();
	}

	/**
	 * Get toast ID
	 */
	getId(): string {
		return this.config.id;
	}

	/**
	 * Get toast height
	 */
	getHeight(): number {
		return this.height;
	}

	/**
	 * Check if dismissed
	 */
	isDismissed(): boolean {
		return this.dismissed;
	}

	/**
	 * Get auto-dismiss duration
	 */
	getDuration(): number | null | undefined {
		return this.config.duration;
	}

	/**
	 * Update Y position (for stacking)
	 */
	setY(y: number): void {
		this.y = y;
		this.updatePosition();
	}

	/**
	 * Get current Y position
	 */
	getY(): number {
		return this.y;
	}

	/**
	 * Check if added to renderer
	 */
	isAddedToRenderer(): boolean {
		return this.addedToRenderer;
	}
}
