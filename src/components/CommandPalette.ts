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

/**
 * CommandPalette component - modal popup for commands (Ctrl+P)
 * Similar to VS Code / OpenCode command palette
 */
export class CommandPalette {
	private container: BoxRenderable;
	private titleBar: TextRenderable;
	private searchInput: TextRenderable;
	private commandItems: TextRenderable[] = [];
	private categoryLabels: TextRenderable[] = [];

	private commands: Command[] = [];
	private filteredCommands: Command[] = [];
	private selectedIndex: number = 0;
	private searchText: string = "";
	private isVisible: boolean = false;

	// Callbacks
	public onClose: (() => void) | null = null;
	public onCommandExecuted: ((commandId: string) => void) | null = null;

	// Dimensions
	private readonly PALETTE_WIDTH = 60;
	private readonly PALETTE_HEIGHT = 20;
	private readonly MAX_VISIBLE_COMMANDS = 15;

	constructor(
		private renderer: CliRenderer,
		private layout: LayoutDimensions,
	) {
		this.container = this.createContainer();
		this.titleBar = this.createTitleBar();
		this.searchInput = this.createSearchInput();
		this.commandItems = this.createCommandItems();
		this.categoryLabels = this.createCategoryLabels();
	}

	private createContainer(): BoxRenderable {
		const left = Math.floor((this.layout.termWidth - this.PALETTE_WIDTH) / 2);
		const top = Math.floor((this.layout.termHeight - this.PALETTE_HEIGHT) / 2);

		return new BoxRenderable(this.renderer, {
			id: "command-palette",
			width: this.PALETTE_WIDTH,
			height: this.PALETTE_HEIGHT,
			backgroundColor: colors.bgSecondary,
			borderStyle: "single",
			borderColor: colors.accent,
			position: "absolute",
			left,
			top,
		});
	}

	private createTitleBar(): TextRenderable {
		const left = Math.floor((this.layout.termWidth - this.PALETTE_WIDTH) / 2);
		const top = Math.floor((this.layout.termHeight - this.PALETTE_HEIGHT) / 2);

		return new TextRenderable(this.renderer, {
			id: "palette-title",
			content: " Commands                                      esc ",
			fg: colors.textDim,
			bg: colors.bgSecondary,
			position: "absolute",
			left: left + 1,
			top: top + 1,
		});
	}

	private createSearchInput(): TextRenderable {
		const left = Math.floor((this.layout.termWidth - this.PALETTE_WIDTH) / 2);
		const top = Math.floor((this.layout.termHeight - this.PALETTE_HEIGHT) / 2);

		return new TextRenderable(this.renderer, {
			id: "palette-search",
			content: "> Search...",
			fg: colors.textDim,
			bg: colors.bgSecondary,
			position: "absolute",
			left: left + 2,
			top: top + 3,
		});
	}

	private createCommandItems(): TextRenderable[] {
		const left = Math.floor((this.layout.termWidth - this.PALETTE_WIDTH) / 2);
		const top = Math.floor((this.layout.termHeight - this.PALETTE_HEIGHT) / 2);
		const items: TextRenderable[] = [];

		for (let i = 0; i < this.MAX_VISIBLE_COMMANDS; i++) {
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

	private createCategoryLabels(): TextRenderable[] {
		// Category labels are rendered inline with commands
		return [];
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
		// Update search input
		const searchContent = this.searchText
			? `> ${this.searchText}`
			: "> Search...";
		(this.searchInput as any).content = searchContent;
		(this.searchInput as any).fg = this.searchText
			? colors.textPrimary
			: colors.textDim;

		// Group commands by category
		const grouped = new Map<string, Command[]>();
		let lastCategory = "";

		for (const cmd of this.filteredCommands) {
			const category = cmd.category || "Commands";
			if (!grouped.has(category)) {
				grouped.set(category, []);
			}
			grouped.get(category)?.push(cmd);
		}

		// Flatten with category headers for display
		const displayItems: Array<{ type: "category" | "command"; content: string; command?: Command; isSelected?: boolean }> = [];
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
		const maxWidth = this.PALETTE_WIDTH - 4;
		for (let i = 0; i < this.commandItems.length; i++) {
			if (i < displayItems.length) {
				const item = displayItems[i];
				if (item.type === "category") {
					// Category header styling
					(this.commandItems[i] as any).content = item.content;
					(this.commandItems[i] as any).fg = colors.accent;
					(this.commandItems[i] as any).bg = colors.bgSecondary;
				} else {
					// Command item styling
					const prefix = item.isSelected ? "> " : "  ";
					const shortcut = item.command?.shortcut ? `  ${item.command.shortcut}` : "";
					let content = `${prefix}${item.content}`;
					
					// Pad and add shortcut on right
					const availableWidth = maxWidth - shortcut.length;
					if (content.length > availableWidth) {
						content = `${content.substring(0, availableWidth - 1)}…`;
					} else {
						content = content.padEnd(availableWidth);
					}
					content += shortcut;

					(this.commandItems[i] as any).content = content;
					(this.commandItems[i] as any).fg = item.isSelected
						? colors.textPrimary
						: colors.textSecondary;
					(this.commandItems[i] as any).bg = item.isSelected
						? colors.accent
						: colors.bgSecondary;
				}
			} else {
				(this.commandItems[i] as any).content = "";
			}
		}
	}

	/**
	 * Render the palette
	 */
	render(): void {
		if (!this.isVisible) return;

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
			this.renderer.root.remove("command-palette");
			this.renderer.root.remove("palette-title");
			this.renderer.root.remove("palette-search");
			for (let i = 0; i < this.commandItems.length; i++) {
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

		const left = Math.floor((layout.termWidth - this.PALETTE_WIDTH) / 2);
		const top = Math.floor((layout.termHeight - this.PALETTE_HEIGHT) / 2);

		(this.container as any).left = left;
		(this.container as any).top = top;

		(this.titleBar as any).left = left + 1;
		(this.titleBar as any).top = top + 1;

		(this.searchInput as any).left = left + 2;
		(this.searchInput as any).top = top + 3;

		for (let i = 0; i < this.commandItems.length; i++) {
			(this.commandItems[i] as any).left = left + 2;
			(this.commandItems[i] as any).top = top + 5 + i;
		}
	}
}
