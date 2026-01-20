import { BoxRenderable, TextRenderable } from "@opentui/core";
import { colors } from "../config/colors";
import type { CliRenderer, LayoutDimensions } from "../types";
import { TypedBox, TypedText, typedBox, typedText } from "../ui";

/**
 * Command definition
 */
export interface Command {
	id: string;
	label: string;
	shortcut?: string;
	category?: string;
	action: () => void | Promise<void>;
}

/**
 * Display item - either a category header or a command
 */
interface DisplayItem {
	type: "category" | "command";
	content: string;
	command?: Command;
	commandIndex?: number; // Index in filteredCommands (for selection tracking)
}

// Colors matching the reference image
const CATEGORY_COLOR = "#f97316"; // Orange for category headers
const SELECTION_BG = "#6b21a8"; // Purple/magenta for selection

// Minimum dimensions
const MIN_WIDTH = 40;
const MIN_HEIGHT = 12;
const MAX_WIDTH = 80;
const MAX_HEIGHT = 30;

// Layout constants
const HEADER_LINES = 5; // Lines used by header: title(1) + blank(1) + search(1) + blank(1) + buffer(1)

/**
 * CommandPalette component - modal popup for commands (Ctrl+P)
 *
 * Features:
 * - Borderless design matching reference image
 * - Proper scroll behavior with viewport tracking
 * - Category headers (non-selectable)
 * - Purple/magenta selection highlight
 * - Responsive sizing with edge case handling
 */
export class CommandPalette {
	private overlay: BoxRenderable;
	private container: BoxRenderable;
	private titleLabel: TextRenderable;
	private escLabel: TextRenderable;
	private searchInput: TextRenderable;
	private commandItems: TextRenderable[] = [];

	// Typed wrappers for safe property updates
	private typedOverlay!: TypedBox;
	private typedContainer!: TypedBox;
	private typedTitleLabel!: TypedText;
	private typedEscLabel!: TypedText;
	private typedSearchInput!: TypedText;
	private typedCommandItems: TypedText[] = [];

	private commands: Command[] = [];
	private filteredCommands: Command[] = [];
	private selectedIndex: number = 0;
	private searchText: string = "";
	private isVisible: boolean = false;

	// Scroll state
	private scrollOffset: number = 0;
	private displayItems: DisplayItem[] = [];

	// Callbacks
	public onClose: (() => void) | null = null;
	public onCommandExecuted: ((commandId: string) => void) | null = null;

	// Responsive dimensions (calculated from terminal size)
	private paletteWidth: number = 60;
	private paletteHeight: number = 20;
	private maxVisibleItems: number = 15;

	constructor(
		private renderer: CliRenderer,
		private layout: LayoutDimensions,
	) {
		this.calculateDimensions();
		this.overlay = this.createOverlay();
		this.container = this.createContainer();
		this.titleLabel = this.createTitleLabel();
		this.escLabel = this.createEscLabel();
		this.searchInput = this.createSearchInput();
		this.commandItems = this.createCommandItems();

		// Wrap renderables for type-safe updates
		this.typedOverlay = typedBox(this.overlay);
		this.typedContainer = typedBox(this.container);
		this.typedTitleLabel = typedText(this.titleLabel);
		this.typedEscLabel = typedText(this.escLabel);
		this.typedSearchInput = typedText(this.searchInput);
		this.typedCommandItems = this.commandItems.map((item) => typedText(item));
	}

	/**
	 * Calculate responsive dimensions based on terminal size
	 * Handles edge cases for very small or large terminals
	 */
	private calculateDimensions(): void {
		const termWidth = this.layout.termWidth;
		const termHeight = this.layout.termHeight;

		// Width: 60% of terminal width, with min/max bounds
		this.paletteWidth = Math.min(
			MAX_WIDTH,
			Math.max(MIN_WIDTH, Math.floor(termWidth * 0.6)),
		);

		// Height: 70% of terminal height, with min/max bounds
		this.paletteHeight = Math.min(
			MAX_HEIGHT,
			Math.max(MIN_HEIGHT, Math.floor(termHeight * 0.7)),
		);

		// Ensure palette fits in terminal
		if (this.paletteWidth > termWidth - 4) {
			this.paletteWidth = Math.max(MIN_WIDTH, termWidth - 4);
		}
		if (this.paletteHeight > termHeight - 2) {
			this.paletteHeight = Math.max(MIN_HEIGHT, termHeight - 2);
		}

		// Max visible items: height minus header lines (title + search + spacing)
		// Leave 1 line at bottom for padding
		this.maxVisibleItems = Math.max(1, this.paletteHeight - HEADER_LINES - 1);
	}

	private getPosition(): { left: number; top: number } {
		const left = Math.max(
			0,
			Math.floor((this.layout.termWidth - this.paletteWidth) / 2),
		);
		const top = Math.max(
			0,
			Math.floor((this.layout.termHeight - this.paletteHeight) / 2),
		);
		return { left, top };
	}

	private createOverlay(): BoxRenderable {
		// Full-screen semi-transparent overlay to dim background
		return new BoxRenderable(this.renderer, {
			id: "command-palette-overlay",
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

		// Borderless container matching reference image
		return new BoxRenderable(this.renderer, {
			id: "command-palette",
			width: this.paletteWidth,
			height: this.paletteHeight,
			backgroundColor: colors.bgSecondary,
			position: "absolute",
			left,
			top,
		});
	}

	private createTitleLabel(): TextRenderable {
		const { left, top } = this.getPosition();

		return new TextRenderable(this.renderer, {
			id: "palette-title",
			content: "Commands",
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
			id: "palette-esc",
			content: "esc",
			fg: colors.textDim,
			bg: colors.bgSecondary,
			position: "absolute",
			left: left + this.paletteWidth - 5,
			top: top + 1,
		});
	}

	private createSearchInput(): TextRenderable {
		const { left, top } = this.getPosition();

		return new TextRenderable(this.renderer, {
			id: "palette-search",
			content: "Search",
			fg: colors.textDim,
			bg: colors.bgSecondary,
			position: "absolute",
			left: left + 2,
			top: top + 3,
		});
	}

	private createCommandItems(): TextRenderable[] {
		const { left, top } = this.getPosition();
		const items: TextRenderable[] = [];

		for (let i = 0; i < this.maxVisibleItems; i++) {
			items.push(
				new TextRenderable(this.renderer, {
					id: `palette-item-${i}`,
					content: "",
					fg: colors.textSecondary,
					bg: colors.bgSecondary,
					position: "absolute",
					left: left + 2,
					top: top + 5 + i,
				}),
			);
		}

		return items;
	}

	/**
	 * Set available commands
	 */
	setCommands(commands: Command[]): void {
		this.commands = commands;
		this.filteredCommands = [...commands];
		this.buildDisplayItems();
		this.updateDisplay();
	}

	/**
	 * Show the command palette
	 */
	show(): void {
		this.isVisible = true;
		this.searchText = "";
		this.selectedIndex = 0;
		this.scrollOffset = 0;
		this.filteredCommands = [...this.commands];
		this.calculateDimensions();
		this.buildDisplayItems();
		this.updateDisplay();
		this.render();
	}

	/**
	 * Hide the command palette
	 */
	hide(): void {
		this.isVisible = false;
		this.destroy();
	}

	/**
	 * Check if palette is visible
	 */
	getIsVisible(): boolean {
		return this.isVisible;
	}

	/**
	 * Handle keyboard input
	 */
	handleInput(key: string, ctrl: boolean): boolean {
		if (!this.isVisible) return false;

		// Escape to close
		if (key === "escape") {
			this.hide();
			this.onClose?.();
			return true;
		}

		// Enter to execute
		if (key === "return") {
			this.executeSelected();
			return true;
		}

		// Navigation
		if (key === "up" || (ctrl && key === "p")) {
			this.moveSelection(-1);
			return true;
		}

		if (key === "down" || (ctrl && key === "n")) {
			this.moveSelection(1);
			return true;
		}

		// Backspace
		if (key === "backspace") {
			if (this.searchText.length > 0) {
				this.searchText = this.searchText.slice(0, -1);
				this.filterCommands();
				this.buildDisplayItems();
				this.updateDisplay();
			}
			return true;
		}

		// Typing (printable characters)
		if (key.length === 1 && !ctrl) {
			this.searchText += key;
			this.filterCommands();
			this.buildDisplayItems();
			this.updateDisplay();
			return true;
		}

		return true; // Consume all input while visible
	}

	/**
	 * Filter commands based on search text
	 */
	private filterCommands(): void {
		if (!this.searchText) {
			this.filteredCommands = [...this.commands];
		} else {
			const query = this.searchText.toLowerCase();
			this.filteredCommands = this.commands.filter(
				(cmd) =>
					cmd.label.toLowerCase().includes(query) ||
					cmd.category?.toLowerCase().includes(query) ||
					cmd.id.toLowerCase().includes(query),
			);
		}
		this.selectedIndex = 0;
		this.scrollOffset = 0;
	}

	/**
	 * Build display items from filtered commands (with category headers)
	 */
	private buildDisplayItems(): void {
		this.displayItems = [];

		if (this.filteredCommands.length === 0) {
			// No results
			this.displayItems.push({
				type: "category",
				content: "No matching commands",
			});
			return;
		}

		// Group commands by category
		const grouped = new Map<string, Command[]>();
		for (const cmd of this.filteredCommands) {
			const category = cmd.category || "Commands";
			if (!grouped.has(category)) {
				grouped.set(category, []);
			}
			grouped.get(category)?.push(cmd);
		}

		// Flatten with category headers
		let commandIndex = 0;
		for (const [category, cmds] of grouped) {
			// Add category header
			this.displayItems.push({ type: "category", content: category });

			for (const cmd of cmds) {
				this.displayItems.push({
					type: "command",
					content: cmd.label,
					command: cmd,
					commandIndex,
				});
				commandIndex++;
			}
		}
	}

	/**
	 * Move selection up or down (skipping category headers)
	 */
	private moveSelection(delta: number): void {
		if (this.filteredCommands.length === 0) return;

		const newIndex = this.selectedIndex + delta;
		if (newIndex >= 0 && newIndex < this.filteredCommands.length) {
			this.selectedIndex = newIndex;
			this.ensureSelectedVisible();
			this.updateDisplay();
		}
	}

	/**
	 * Ensure the selected item is visible in the viewport
	 */
	private ensureSelectedVisible(): void {
		// Find the display index of the selected command
		let displayIndex = 0;
		for (let i = 0; i < this.displayItems.length; i++) {
			const item = this.displayItems[i];
			if (item.type === "command" && item.commandIndex === this.selectedIndex) {
				displayIndex = i;
				break;
			}
		}

		// Adjust scroll offset to keep selected item visible
		if (displayIndex < this.scrollOffset) {
			// Selected item is above viewport - scroll up
			this.scrollOffset = displayIndex;
		} else if (displayIndex >= this.scrollOffset + this.maxVisibleItems) {
			// Selected item is below viewport - scroll down
			this.scrollOffset = displayIndex - this.maxVisibleItems + 1;
		}

		// Clamp scroll offset
		const maxScroll = Math.max(
			0,
			this.displayItems.length - this.maxVisibleItems,
		);
		this.scrollOffset = Math.max(0, Math.min(this.scrollOffset, maxScroll));
	}

	/**
	 * Execute the selected command
	 */
	private async executeSelected(): Promise<void> {
		const command = this.filteredCommands[this.selectedIndex];
		if (command) {
			this.hide();
			this.onClose?.();
			await command.action();
			this.onCommandExecuted?.(command.id);
		}
	}

	/**
	 * Update the display
	 */
	private updateDisplay(): void {
		// Full width for selection bar (container width minus left/right padding of 2 each)
		const fullWidth = this.paletteWidth - 4;

		// Update search input - show typed text or placeholder
		const searchContent = this.searchText || "Search";
		this.typedSearchInput.update({
			content: searchContent,
			fg: this.searchText ? colors.textPrimary : colors.textDim,
		});

		// Get visible items based on scroll offset
		const visibleItems = this.displayItems.slice(
			this.scrollOffset,
			this.scrollOffset + this.maxVisibleItems,
		);

		// Update display items
		for (let i = 0; i < this.typedCommandItems.length; i++) {
			if (i < visibleItems.length) {
				const item = visibleItems[i];

				if (item.type === "category") {
					// Category header styling (orange)
					// Pad to full width for consistent background
					const categoryContent = item.content.padEnd(fullWidth, " ");
					this.typedCommandItems[i].update({
						content: categoryContent,
						fg: CATEGORY_COLOR,
						bg: colors.bgSecondary,
					});
				} else {
					// Command item styling
					const isSelected = item.commandIndex === this.selectedIndex;
					const shortcut = item.command?.shortcut || "";
					let label = item.content;

					// Calculate available space for label (leave room for shortcut)
					const availableWidth = fullWidth - shortcut.length - 2;
					if (label.length > availableWidth && availableWidth > 3) {
						label = `${label.substring(0, availableWidth - 1)}...`;
					}

					// Build content: label + padding + shortcut
					// Pad to full width so selection bar stretches across
					const padding = Math.max(
						1,
						fullWidth - label.length - shortcut.length,
					);
					const content = label + " ".repeat(padding) + shortcut;

					this.typedCommandItems[i].update({
						content,
						fg: isSelected ? colors.textPrimary : colors.textSecondary,
						bg: isSelected ? SELECTION_BG : colors.bgSecondary,
					});
				}
			} else {
				// Clear unused slots
				this.typedCommandItems[i].update({
					content: "",
					bg: colors.bgSecondary,
				});
			}
		}
	}

	/**
	 * Render the palette
	 */
	render(): void {
		if (!this.isVisible) return;

		// Add overlay first (dims background)
		this.renderer.root.add(this.overlay);
		// Then add the palette on top
		this.renderer.root.add(this.container);
		this.renderer.root.add(this.titleLabel);
		this.renderer.root.add(this.escLabel);
		this.renderer.root.add(this.searchInput);
		for (const item of this.commandItems) {
			this.renderer.root.add(item);
		}
	}

	/**
	 * Remove from renderer
	 */
	destroy(): void {
		try {
			this.renderer.root.remove("command-palette-overlay");
			this.renderer.root.remove("command-palette");
			this.renderer.root.remove("palette-title");
			this.renderer.root.remove("palette-esc");
			this.renderer.root.remove("palette-search");
			for (let i = 0; i < this.maxVisibleItems; i++) {
				this.renderer.root.remove(`palette-item-${i}`);
			}
		} catch {
			// Elements might not be added yet
		}
	}

	/**
	 * Update layout (for terminal resize)
	 */
	updateLayout(layout: LayoutDimensions): void {
		this.layout = layout;

		const oldMaxVisibleItems = this.maxVisibleItems;
		this.calculateDimensions();

		const { left, top } = this.getPosition();

		// Update overlay to cover full screen
		this.typedOverlay.update({
			width: layout.termWidth,
			height: layout.termHeight,
		});

		// Update container (borderless)
		this.typedContainer.update({
			width: this.paletteWidth,
			height: this.paletteHeight,
			left,
			top,
		});

		// Update title label
		this.typedTitleLabel.update({
			left: left + 2,
			top: top + 1,
		});

		// Update esc label
		this.typedEscLabel.update({
			left: left + this.paletteWidth - 5,
			top: top + 1,
		});

		// Update search input
		this.typedSearchInput.setPosition(left + 2, top + 3);

		// Update command items positions
		for (let i = 0; i < this.typedCommandItems.length; i++) {
			this.typedCommandItems[i].setPosition(left + 2, top + 5 + i);
		}

		// If maxVisibleItems changed, we may need to recreate items
		// For now, just ensure display is updated
		if (this.isVisible) {
			this.ensureSelectedVisible();
			this.updateDisplay();
		}
	}
}
