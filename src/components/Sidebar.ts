import { BoxRenderable, TextRenderable } from "@opentui/core";
import { colors } from "../config/colors";
import { LIBRARY_MENU_ITEMS, UI_STRINGS } from "../config/constants";
import type { CliRenderer, LayoutDimensions, MenuItem } from "../types";

/**
 * Sidebar component displaying the library menu (left side)
 */
export class Sidebar {
	private container: BoxRenderable;
	private title: TextRenderable;
	private menuItems: TextRenderable[] = [];
	private selectedIndex: number = 0;
	private readonly items: MenuItem[];
	private isFocused: boolean = false;

	// Callback when menu item is selected
	public onSelect: ((item: MenuItem) => void) | null = null;

	constructor(
		private renderer: CliRenderer,
		private layout: LayoutDimensions,
		items: MenuItem[] = LIBRARY_MENU_ITEMS,
	) {
		this.items = items;
		this.container = this.createContainer();
		this.title = this.createTitle();
		this.menuItems = this.createMenuItems();
	}

	private createContainer(): BoxRenderable {
		return new BoxRenderable(this.renderer, {
			id: "sidebar",
			width: this.layout.leftSidebarWidth,
			height: this.layout.leftSidebarHeight,
			backgroundColor: colors.bg,
			borderStyle: "single",
			borderColor: this.isFocused ? colors.accent : colors.border,
			position: "absolute",
			left: this.layout.leftSidebarX,
			top: this.layout.leftSidebarY,
		});
	}

	private createTitle(): TextRenderable {
		return new TextRenderable(this.renderer, {
			id: "library-title",
			content: UI_STRINGS.library,
			fg: colors.textDim,
			position: "absolute",
			left: this.layout.leftSidebarX + 2,
			top: this.layout.leftSidebarY + 1,
		});
	}

	private createMenuItems(): TextRenderable[] {
		return this.items.map((item, index) => {
			const isSelected = index === this.selectedIndex;
			return new TextRenderable(this.renderer, {
				id: `menu-${item.id}`,
				content: this.formatMenuItem(item.label, isSelected),
				fg: isSelected ? colors.textPrimary : colors.textSecondary,
				position: "absolute",
				left: this.layout.leftSidebarX + 2,
				top: this.layout.leftSidebarY + 3 + index,
			});
		});
	}

	private formatMenuItem(label: string, isSelected: boolean): string {
		return `${isSelected ? ">" : " "} ${label}`;
	}

	/**
	 * Set focus state (highlights border)
	 */
	setFocused(focused: boolean): void {
		this.isFocused = focused;
		(this.container as any).borderColor = focused
			? colors.accent
			: colors.border;
	}

	/**
	 * Check if focused
	 */
	hasFocus(): boolean {
		return this.isFocused;
	}

	/**
	 * Move selection up
	 */
	selectPrevious(): void {
		this.selectedIndex = Math.max(0, this.selectedIndex - 1);
		this.updateMenuDisplay();
	}

	/**
	 * Move selection down
	 */
	selectNext(): void {
		this.selectedIndex = Math.min(
			this.items.length - 1,
			this.selectedIndex + 1,
		);
		this.updateMenuDisplay();
	}

	/**
	 * Get currently selected item
	 */
	getSelectedItem(): MenuItem {
		return this.items[this.selectedIndex];
	}

	/**
	 * Get selected index
	 */
	getSelectedIndex(): number {
		return this.selectedIndex;
	}

	/**
	 * Trigger selection of current item
	 */
	selectCurrent(): void {
		const item = this.getSelectedItem();
		if (this.onSelect) {
			this.onSelect(item);
		}
	}

	private updateMenuDisplay(): void {
		this.menuItems.forEach((item, index) => {
			const isSelected = index === this.selectedIndex;
			const menuItem = this.items[index];

			(item as any).content = this.formatMenuItem(menuItem.label, isSelected);
			(item as any).fg = isSelected ? colors.textPrimary : colors.textSecondary;
		});
	}

	/**
	 * Add all elements to renderer
	 */
	render(): void {
		this.renderer.root.add(this.container);
		this.renderer.root.add(this.title);
		for (const item of this.menuItems) {
			this.renderer.root.add(item);
		}
	}

	/**
	 * Update layout dimensions (for terminal resize)
	 */
	updateLayout(layout: LayoutDimensions): void {
		this.layout = layout;

		// Update container
		(this.container as any).width = layout.leftSidebarWidth;
		(this.container as any).height = layout.leftSidebarHeight;
		(this.container as any).left = layout.leftSidebarX;
		(this.container as any).top = layout.leftSidebarY;

		// Update title
		(this.title as any).left = layout.leftSidebarX + 2;
		(this.title as any).top = layout.leftSidebarY + 1;

		// Update menu items
		this.menuItems.forEach((item, index) => {
			(item as any).left = layout.leftSidebarX + 2;
			(item as any).top = layout.leftSidebarY + 3 + index;
		});
	}

	/**
	 * Cleanup resources
	 */
	destroy(): void {
		// Remove from renderer if needed
	}
}
