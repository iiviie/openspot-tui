import { BoxRenderable, TextRenderable } from "@opentui/core";
import { colors } from "../config/colors";
import type { CliRenderer, LayoutDimensions } from "../types";

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

// Category label color (muted purple/lavender like in Claude Code)
const CATEGORY_COLOR = "#a78bfa"; // violet-400

// Overlay color for dimming background
const OVERLAY_COLOR = "#000000";

/**
 * CommandPalette component - modal popup for commands (Ctrl+P)
 * Responsive design that adapts to terminal size
 */
export class CommandPalette {
	private overlay: BoxRenderable;
	private container: BoxRenderable;
	private titleBar: TextRenderable;
	private searchInput: TextRenderable;
	private commandItems: TextRenderable[] = [];

	private commands: Command[] = [];
	private filteredCommands: Command[] = [];
	private selectedIndex: number = 0;
	private searchText: string = "";
	private isVisible: boolean = false;

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
		this.titleBar = this.createTitleBar();
		this.searchInput = this.createSearchInput();
		this.commandItems = this.createCommandItems();
	}

	/**
	 * Calculate responsive dimensions based on terminal size
	 */
	private calculateDimensions(): void {
		// Width: 50% of terminal width, min 50, max 80
		this.paletteWidth = Math.min(
			80,
			Math.max(50, Math.floor(this.layout.termWidth * 0.5)),
		);

		// Height: 60% of terminal height, min 15, max 25
		this.paletteHeight = Math.min(
			25,
			Math.max(15, Math.floor(this.layout.termHeight * 0.6)),
		);

		// Max visible items: height - 5 (for border, title, search, padding)
		this.maxVisibleItems = this.paletteHeight - 5;
	}

	private getPosition(): { left: number; top: number } {
		return {
			left: Math.floor((this.layout.termWidth - this.paletteWidth) / 2),
			top: Math.floor((this.layout.termHeight - this.paletteHeight) / 2),
		};
	}

	private createOverlay(): BoxRenderable {
		// Full-screen semi-transparent overlay to dim background
		return new BoxRenderable(this.renderer, {
			id: "command-palette-overlay",
			width: this.layout.termWidth,
			height: this.layout.termHeight,
			backgroundColor: OVERLAY_COLOR,
			position: "absolute",
			left: 0,
			top: 0,
		});
	}

	private createContainer(): BoxRenderable {
		const { left, top } = this.getPosition();

		return new BoxRenderable(this.renderer, {
			id: "command-palette",
			width: this.paletteWidth,
			height: this.paletteHeight,
			backgroundColor: colors.bgSecondary,
			borderStyle: "single",
			borderColor: colors.border,
			position: "absolute",
			left,
			top,
		});
	}

	private createTitleBar(): TextRenderable {
		const { left, top } = this.getPosition();
		const innerWidth = this.paletteWidth - 2;

		// "Commands" on left, "esc" on right
		const title = "Commands";
		const escHint = "esc";
		const padding = innerWidth - title.length - escHint.length;
		const content = title + " ".repeat(Math.max(1, padding)) + escHint;

		return new TextRenderable(this.renderer, {
			id: "palette-title",
			content,
			fg: colors.textDim,
			bg: colors.bgSecondary,
			position: "absolute",
			left: left + 1,
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
					left: left + 1,
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
		this.updateDisplay();
	}

	/**
	 * Show the command palette
	 */
	show(): void {
		this.isVisible = true;
		this.searchText = "";
		this.selectedIndex = 0;
		this.filteredCommands = [...this.commands];
		this.calculateDimensions();
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
				this.updateDisplay();
			}
			return true;
		}

		// Typing (printable characters)
		if (key.length === 1 && !ctrl) {
			this.searchText += key;
			this.filterCommands();
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
	}

	/**
	 * Move selection up or down
	 */
	private moveSelection(delta: number): void {
		const newIndex = this.selectedIndex + delta;
		if (newIndex >= 0 && newIndex < this.filteredCommands.length) {
			this.selectedIndex = newIndex;
			this.updateDisplay();
		}
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
		const innerWidth = this.paletteWidth - 2;

		// Update search input
		const searchContent = this.searchText ? this.searchText : "Search";
		(this.searchInput as any).content = searchContent;
		(this.searchInput as any).fg = this.searchText
			? colors.textPrimary
			: colors.textDim;

		// Group commands by category
		const grouped = new Map<string, Command[]>();

		for (const cmd of this.filteredCommands) {
			const category = cmd.category || "Commands";
			if (!grouped.has(category)) {
				grouped.set(category, []);
			}
			grouped.get(category)?.push(cmd);
		}

		// Flatten with category headers for display
		const displayItems: Array<{
			type: "category" | "command";
			content: string;
			command?: Command;
			isSelected?: boolean;
		}> = [];
		let currentIndex = 0;

		for (const [category, cmds] of grouped) {
			// Add category header
			displayItems.push({ type: "category", content: category });

			for (const cmd of cmds) {
				const isSelected = currentIndex === this.selectedIndex;
				displayItems.push({
					type: "command",
					content: cmd.label,
					command: cmd,
					isSelected,
				});
				currentIndex++;
			}
		}

		// Update display items
		for (let i = 0; i < this.commandItems.length; i++) {
			if (i < displayItems.length) {
				const item = displayItems[i];
				if (item.type === "category") {
					// Category header styling (muted purple like in the image)
					(this.commandItems[i] as any).content = item.content;
					(this.commandItems[i] as any).fg = CATEGORY_COLOR;
					(this.commandItems[i] as any).bg = colors.bgSecondary;
				} else {
					// Command item styling
					const shortcut = item.command?.shortcut
						? `${item.command.shortcut}`
						: "";
					let label = item.content;

					// Calculate available space for label
					const availableWidth = innerWidth - shortcut.length - 2;
					if (label.length > availableWidth) {
						label = `${label.substring(0, availableWidth - 1)}…`;
					}

					// Build content: label + padding + shortcut
					const padding = innerWidth - label.length - shortcut.length;
					const content = label + " ".repeat(Math.max(1, padding)) + shortcut;

					(this.commandItems[i] as any).content = content;
					(this.commandItems[i] as any).fg = item.isSelected
						? colors.textPrimary
						: colors.textSecondary;
					(this.commandItems[i] as any).bg = item.isSelected
						? colors.highlight
						: colors.bgSecondary;
				}
			} else {
				(this.commandItems[i] as any).content = "";
				(this.commandItems[i] as any).bg = colors.bgSecondary;
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
		this.renderer.root.add(this.titleBar);
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
		this.calculateDimensions();

		const { left, top } = this.getPosition();
		const innerWidth = this.paletteWidth - 2;

		// Update overlay to cover full screen
		(this.overlay as any).width = layout.termWidth;
		(this.overlay as any).height = layout.termHeight;

		// Update container
		(this.container as any).width = this.paletteWidth;
		(this.container as any).height = this.paletteHeight;
		(this.container as any).left = left;
		(this.container as any).top = top;

		// Update title bar
		const title = "Commands";
		const escHint = "esc";
		const padding = innerWidth - title.length - escHint.length;
		(this.titleBar as any).content =
			title + " ".repeat(Math.max(1, padding)) + escHint;
		(this.titleBar as any).left = left + 1;
		(this.titleBar as any).top = top + 1;

		// Update search input
		(this.searchInput as any).left = left + 2;
		(this.searchInput as any).top = top + 3;

		// Update command items positions
		for (let i = 0; i < this.commandItems.length; i++) {
			(this.commandItems[i] as any).left = left + 1;
			(this.commandItems[i] as any).top = top + 5 + i;
		}

		if (this.isVisible) {
			this.updateDisplay();
		}
	}
}
