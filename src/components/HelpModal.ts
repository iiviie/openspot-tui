import { BoxRenderable, TextRenderable } from "@opentui/core";
import { colors } from "../config/colors";
import type { CliRenderer, LayoutDimensions } from "../types";
import { TypedBox, TypedText, typedBox, typedText } from "../ui";

/**
 * Keyboard shortcut definition
 */
interface ShortcutItem {
	key: string;
	description: string;
}

/**
 * Shortcut category
 */
interface ShortcutCategory {
	name: string;
	shortcuts: ShortcutItem[];
}

// Colors
const CATEGORY_COLOR = "#f97316"; // Orange for category headers
const KEY_COLOR = "#5eead4"; // Teal for keys

// All keyboard shortcuts organized by category
const SHORTCUTS: ShortcutCategory[] = [
	{
		name: "Navigation",
		shortcuts: [
			{ key: "h / l", description: "Focus library / content panel" },
			{ key: "j / k", description: "Move down / up in lists" },
			{ key: "Enter", description: "Select item" },
			{ key: "Escape", description: "Go back" },
			{ key: "/", description: "Open search" },
			{ key: "Ctrl+P", description: "Open command palette" },
		],
	},
	{
		name: "Playback",
		shortcuts: [
			{ key: "Space", description: "Play / Pause" },
			{ key: "w", description: "Next track" },
			{ key: "b", description: "Previous track" },
			{ key: "Left / Right", description: "Seek backward / forward (5s)" },
			{ key: "+ / -", description: "Volume up / down" },
		],
	},
	{
		name: "Modes",
		shortcuts: [
			{ key: "s", description: "Toggle shuffle" },
			{ key: "r", description: "Cycle repeat (Off → Playlist → Track)" },
		],
	},
	{
		name: "Queue",
		shortcuts: [{ key: "f", description: "Add selected track to queue" }],
	},
	{
		name: "Application",
		shortcuts: [
			{ key: "q", description: "Quit application" },
			{ key: "Ctrl+C", description: "Force quit" },
		],
	},
];

// Dimensions
const MIN_WIDTH = 50;
const MAX_WIDTH = 70;
const MIN_HEIGHT = 20;
const MAX_HEIGHT = 35;

/**
 * HelpModal component - shows keyboard shortcuts (? key)
 *
 * Features:
 * - Borderless design matching CommandPalette
 * - Organized by category
 * - Scrollable for long lists
 * - Press ? or Escape to close
 */
export class HelpModal {
	private overlay: BoxRenderable;
	private container: BoxRenderable;
	private titleLabel: TextRenderable;
	private escLabel: TextRenderable;
	private contentItems: TextRenderable[] = [];

	// Typed wrappers
	private typedOverlay!: TypedBox;
	private typedContainer!: TypedBox;
	private typedTitleLabel!: TypedText;
	private typedEscLabel!: TypedText;
	private typedContentItems: TypedText[] = [];

	private isVisible: boolean = false;
	private scrollOffset: number = 0;

	// Callbacks
	public onClose: (() => void) | null = null;

	// Dimensions
	private modalWidth: number = 60;
	private modalHeight: number = 25;
	private maxVisibleLines: number = 20;

	// Pre-built display lines
	private displayLines: Array<{
		type: "category" | "shortcut";
		content: string;
		key?: string;
	}> = [];

	constructor(
		private renderer: CliRenderer,
		private layout: LayoutDimensions,
	) {
		this.buildDisplayLines();
		this.calculateDimensions();
		this.overlay = this.createOverlay();
		this.container = this.createContainer();
		this.titleLabel = this.createTitleLabel();
		this.escLabel = this.createEscLabel();
		this.contentItems = this.createContentItems();

		// Wrap for type-safe updates
		this.typedOverlay = typedBox(this.overlay);
		this.typedContainer = typedBox(this.container);
		this.typedTitleLabel = typedText(this.titleLabel);
		this.typedEscLabel = typedText(this.escLabel);
		this.typedContentItems = this.contentItems.map((item) => typedText(item));
	}

	/**
	 * Build display lines from shortcuts data
	 */
	private buildDisplayLines(): void {
		this.displayLines = [];

		for (const category of SHORTCUTS) {
			// Add category header
			this.displayLines.push({ type: "category", content: category.name });

			// Add shortcuts
			for (const shortcut of category.shortcuts) {
				this.displayLines.push({
					type: "shortcut",
					content: shortcut.description,
					key: shortcut.key,
				});
			}

			// Add blank line between categories
			this.displayLines.push({ type: "shortcut", content: "" });
		}

		// Remove trailing blank line
		if (
			this.displayLines.length > 0 &&
			this.displayLines[this.displayLines.length - 1].content === ""
		) {
			this.displayLines.pop();
		}
	}

	/**
	 * Calculate responsive dimensions
	 */
	private calculateDimensions(): void {
		const termWidth = this.layout.termWidth;
		const termHeight = this.layout.termHeight;

		// Width: 50% of terminal, bounded
		this.modalWidth = Math.min(
			MAX_WIDTH,
			Math.max(MIN_WIDTH, Math.floor(termWidth * 0.5)),
		);

		// Height: 70% of terminal, bounded
		this.modalHeight = Math.min(
			MAX_HEIGHT,
			Math.max(MIN_HEIGHT, Math.floor(termHeight * 0.7)),
		);

		// Ensure fits in terminal
		if (this.modalWidth > termWidth - 4) {
			this.modalWidth = Math.max(MIN_WIDTH, termWidth - 4);
		}
		if (this.modalHeight > termHeight - 2) {
			this.modalHeight = Math.max(MIN_HEIGHT, termHeight - 2);
		}

		// Lines available for content (minus header)
		this.maxVisibleLines = Math.max(1, this.modalHeight - 4);
	}

	private getPosition(): { left: number; top: number } {
		const left = Math.max(
			0,
			Math.floor((this.layout.termWidth - this.modalWidth) / 2),
		);
		const top = Math.max(
			0,
			Math.floor((this.layout.termHeight - this.modalHeight) / 2),
		);
		return { left, top };
	}

	private createOverlay(): BoxRenderable {
		return new BoxRenderable(this.renderer, {
			id: "help-modal-overlay",
			width: this.layout.termWidth,
			height: this.layout.termHeight,
			backgroundColor: "#000000",
			position: "absolute",
			left: 0,
			top: 0,
		});
	}

	private createContainer(): BoxRenderable {
		const { left, top } = this.getPosition();

		return new BoxRenderable(this.renderer, {
			id: "help-modal",
			width: this.modalWidth,
			height: this.modalHeight,
			backgroundColor: colors.bgSecondary,
			position: "absolute",
			left,
			top,
		});
	}

	private createTitleLabel(): TextRenderable {
		const { left, top } = this.getPosition();

		return new TextRenderable(this.renderer, {
			id: "help-title",
			content: "Keyboard Shortcuts",
			fg: colors.textSecondary,
			bg: colors.bgSecondary,
			position: "absolute",
			left: left + 2,
			top: top + 1,
		});
	}

	private createEscLabel(): TextRenderable {
		const { left, top } = this.getPosition();

		return new TextRenderable(this.renderer, {
			id: "help-esc",
			content: "? / esc",
			fg: colors.textDim,
			bg: colors.bgSecondary,
			position: "absolute",
			left: left + this.modalWidth - 9,
			top: top + 1,
		});
	}

	private createContentItems(): TextRenderable[] {
		const { left, top } = this.getPosition();
		const items: TextRenderable[] = [];

		for (let i = 0; i < this.maxVisibleLines; i++) {
			items.push(
				new TextRenderable(this.renderer, {
					id: `help-line-${i}`,
					content: "",
					fg: colors.textSecondary,
					bg: colors.bgSecondary,
					position: "absolute",
					left: left + 2,
					top: top + 3 + i,
				}),
			);
		}

		return items;
	}

	/**
	 * Show the help modal
	 */
	show(): void {
		this.isVisible = true;
		this.scrollOffset = 0;
		this.calculateDimensions();
		this.updateDisplay();
		this.render();
	}

	/**
	 * Hide the help modal
	 */
	hide(): void {
		this.isVisible = false;
		this.destroy();
	}

	/**
	 * Toggle visibility
	 */
	toggle(): void {
		if (this.isVisible) {
			this.hide();
			this.onClose?.();
		} else {
			this.show();
		}
	}

	/**
	 * Check if visible
	 */
	getIsVisible(): boolean {
		return this.isVisible;
	}

	/**
	 * Handle keyboard input
	 */
	handleInput(key: string): boolean {
		if (!this.isVisible) return false;

		// Close on escape or ?
		if (key === "escape" || key === "?") {
			this.hide();
			this.onClose?.();
			return true;
		}

		// Scroll up
		if (key === "up" || key === "k") {
			if (this.scrollOffset > 0) {
				this.scrollOffset--;
				this.updateDisplay();
			}
			return true;
		}

		// Scroll down
		if (key === "down" || key === "j") {
			const maxScroll = Math.max(
				0,
				this.displayLines.length - this.maxVisibleLines,
			);
			if (this.scrollOffset < maxScroll) {
				this.scrollOffset++;
				this.updateDisplay();
			}
			return true;
		}

		return true; // Consume all input while visible
	}

	/**
	 * Update the display
	 */
	private updateDisplay(): void {
		const innerWidth = this.modalWidth - 4;

		// Get visible lines based on scroll
		const visibleLines = this.displayLines.slice(
			this.scrollOffset,
			this.scrollOffset + this.maxVisibleLines,
		);

		for (let i = 0; i < this.typedContentItems.length; i++) {
			if (i < visibleLines.length) {
				const line = visibleLines[i];

				if (line.type === "category") {
					// Category header (orange, padded)
					const content = line.content.padEnd(innerWidth, " ");
					this.typedContentItems[i].update({
						content,
						fg: CATEGORY_COLOR,
						bg: colors.bgSecondary,
					});
				} else if (line.key) {
					// Shortcut line: key + description
					const keyPart = line.key.padEnd(16, " ");
					const descPart = line.content;
					const fullContent = (keyPart + descPart).padEnd(innerWidth, " ");

					this.typedContentItems[i].update({
						content: fullContent,
						fg: colors.textSecondary,
						bg: colors.bgSecondary,
					});
				} else {
					// Blank line
					this.typedContentItems[i].update({
						content: "",
						bg: colors.bgSecondary,
					});
				}
			} else {
				// Clear unused lines
				this.typedContentItems[i].update({
					content: "",
					bg: colors.bgSecondary,
				});
			}
		}
	}

	/**
	 * Render the modal
	 */
	render(): void {
		if (!this.isVisible) return;

		this.renderer.root.add(this.overlay);
		this.renderer.root.add(this.container);
		this.renderer.root.add(this.titleLabel);
		this.renderer.root.add(this.escLabel);
		for (const item of this.contentItems) {
			this.renderer.root.add(item);
		}
	}

	/**
	 * Remove from renderer
	 */
	destroy(): void {
		try {
			this.renderer.root.remove("help-modal-overlay");
			this.renderer.root.remove("help-modal");
			this.renderer.root.remove("help-title");
			this.renderer.root.remove("help-esc");
			for (let i = 0; i < this.maxVisibleLines; i++) {
				this.renderer.root.remove(`help-line-${i}`);
			}
		} catch {
			// Elements might not be added yet
		}
	}

	/**
	 * Update layout for terminal resize
	 */
	updateLayout(layout: LayoutDimensions): void {
		this.layout = layout;
		this.calculateDimensions();

		const { left, top } = this.getPosition();

		this.typedOverlay.update({
			width: layout.termWidth,
			height: layout.termHeight,
		});

		this.typedContainer.update({
			width: this.modalWidth,
			height: this.modalHeight,
			left,
			top,
		});

		this.typedTitleLabel.update({
			left: left + 2,
			top: top + 1,
		});

		this.typedEscLabel.update({
			left: left + this.modalWidth - 9,
			top: top + 1,
		});

		for (let i = 0; i < this.typedContentItems.length; i++) {
			this.typedContentItems[i].setPosition(left + 2, top + 3 + i);
		}

		if (this.isVisible) {
			this.updateDisplay();
		}
	}
}
