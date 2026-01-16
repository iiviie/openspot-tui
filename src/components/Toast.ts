import { BoxRenderable, TextRenderable } from "@opentui/core";
import { colors } from "../config/colors";
import type { CliRenderer } from "../types";

/**
 * Toast notification types
 */
export type ToastType = "info" | "success" | "warning" | "error" | "action";

/**
 * Toast action button
 */
export interface ToastAction {
	label: string;
	key: string; // Keyboard shortcut (e.g., 'c' for copy)
	action: () => void;
}

/**
 * Toast configuration
 */
export interface ToastConfig {
	id: string;
	type: ToastType;
	title: string;
	message: string;
	url?: string; // Optional URL to display/copy
	duration?: number | null; // Auto-dismiss duration (ms), null = persistent
	dismissable?: boolean; // Can be manually dismissed (default: true)
	actions?: ToastAction[]; // Optional action buttons
	onDismiss?: () => void; // Callback when dismissed
}

/**
 * Toast notification component
 * Displays temporary notifications in the top-right corner
 */
export class Toast {
	private renderer: CliRenderer;
	private config: ToastConfig;
	private x: number;
	private y: number;
	private width: number = 45; // Fixed width for toasts
	private height: number = 0; // Calculated based on content

	private container!: BoxRenderable;
	private titleLabel!: TextRenderable;
	private messageLabel!: TextRenderable;
	private urlLabel?: TextRenderable;
	private actionHintLabel?: TextRenderable;
	private dismissHintLabel!: TextRenderable;

	private dismissed: boolean = false;

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

		this.calculateHeight();
		this.createComponents();
	}

	/**
	 * Calculate toast height based on content
	 */
	private calculateHeight(): void {
		let height = 3; // Border + title

		// Message lines (word wrap at width - 4 for borders and padding)
		const maxLineWidth = this.width - 4;
		const messageLines = this.wrapText(this.config.message, maxLineWidth);
		height += messageLines.length;

		// URL line
		if (this.config.url) {
			height += 2; // URL + spacing
		}

		// Action hints
		if (this.config.actions && this.config.actions.length > 0) {
			height += 1;
		}

		// Dismiss hint
		if (this.config.dismissable) {
			height += 1;
		}

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
				return "ℹ";
			case "success":
				return "✓";
			case "warning":
				return "⚠";
			case "error":
				return "✗";
			case "action":
				return "→";
		}
	}

	/**
	 * Create UI components
	 */
	private createComponents(): void {
		// Container box
		this.container = new BoxRenderable(this.renderer, {
			id: `toast-${this.config.id}`,
			position: "absolute",
			left: this.x,
			top: this.y,
			width: this.width,
			height: this.height,
			borderColor: this.getBorderColor(),
			borderStyle: "single",
		});

		// Title with icon
		const icon = this.getIcon();
		this.titleLabel = new TextRenderable(this.renderer, {
			id: `toast-${this.config.id}-title`,
			content: `${icon} ${this.config.title}`,
			fg: this.getBorderColor(),
			position: "absolute",
			left: this.x + 2,
			top: this.y + 1,
		});

		// Message (multi-line)
		const messageLines = this.wrapText(this.config.message, this.width - 4);
		const messageContent = messageLines.join("\n");
		this.messageLabel = new TextRenderable(this.renderer, {
			id: `toast-${this.config.id}-message`,
			content: messageContent,
			fg: colors.textPrimary,
			position: "absolute",
			left: this.x + 2,
			top: this.y + 2,
		});

		let currentY = this.y + 2 + messageLines.length;

		// URL (if present)
		if (this.config.url) {
			currentY += 1; // Spacing
			const truncatedUrl =
				this.config.url.length > this.width - 6
					? this.config.url.substring(0, this.width - 9) + "..."
					: this.config.url;
			this.urlLabel = new TextRenderable(this.renderer, {
				id: `toast-${this.config.id}-url`,
				content: `URL: ${truncatedUrl}`,
				fg: colors.accent,
				position: "absolute",
				left: this.x + 2,
				top: currentY,
			});
			currentY += 1;
		}

		// Action hints
		if (this.config.actions && this.config.actions.length > 0) {
			const actionHints = this.config.actions
				.map((a) => `[${a.key}]: ${a.label}`)
				.join(" ");
			this.actionHintLabel = new TextRenderable(this.renderer, {
				id: `toast-${this.config.id}-actions`,
				content: actionHints,
				fg: colors.textDim,
				position: "absolute",
				left: this.x + 2,
				top: currentY,
			});
			currentY += 1;
		}

		// Dismiss hint
		if (this.config.dismissable) {
			this.dismissHintLabel = new TextRenderable(this.renderer, {
				id: `toast-${this.config.id}-dismiss`,
				content: "[Esc]: Dismiss",
				fg: colors.textDim,
				position: "absolute",
				left: this.x + 2,
				top: currentY,
			});
		}
	}

	/**
	 * Render the toast
	 */
	render(): void {
		if (this.dismissed) return;

		this.renderer.root.add(this.container);
		this.renderer.root.add(this.titleLabel);
		this.renderer.root.add(this.messageLabel);
		if (this.urlLabel) this.renderer.root.add(this.urlLabel);
		if (this.actionHintLabel) this.renderer.root.add(this.actionHintLabel);
		if (this.dismissHintLabel) this.renderer.root.add(this.dismissHintLabel);
	}

	/**
	 * Handle keyboard input
	 */
	handleInput(key: string): boolean {
		// Check action keys
		if (this.config.actions) {
			for (const action of this.config.actions) {
				if (key === action.key) {
					action.action();
					return true;
				}
			}
		}

		// Check dismiss
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
	updatePosition(y: number): void {
		this.y = y;
		// Re-create components with new position
		this.createComponents();
	}
}
