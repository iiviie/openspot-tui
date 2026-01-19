import { BoxRenderable, TextRenderable } from "@opentui/core";
import { colors } from "../config/colors";
import { LIBRARY_MENU_ITEMS, UI_STRINGS } from "../config/constants";
import type { CliRenderer, LayoutDimensions, MenuItem } from "../types";

/**
 * Sidebar component displaying welcome section + library menu (left side)
 */
export class Sidebar {
	private container: BoxRenderable;
	private welcomeTitle: TextRenderable;
	private usernameLabel: TextRenderable;
	private title: TextRenderable;
	private menuItems: TextRenderable[] = [];
	private selectedIndex: number = 0;
	private readonly items: MenuItem[];
	private isFocused: boolean = false;
	private username: string | null = null;

	// Callback when menu item is selected
	public onSelect: ((item: MenuItem) => void) | null = null;

	constructor(
		private renderer: CliRenderer,
		private layout: LayoutDimensions,
		items: MenuItem[] = LIBRARY_MENU_ITEMS,
		username: string | null = null,
	) {
		this.items = items;
		this.username = username;
		this.container = this.createContainer();
		this.welcomeTitle = this.createWelcomeTitle();
		this.usernameLabel = this.createUsernameLabel();
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

	private createWelcomeTitle(): TextRenderable {
		return new TextRenderable(this.renderer, {
			id: "welcome-title",
			content: "WELCOME",
			fg: colors.textDim,
			position: "absolute",
			left: this.layout.leftSidebarX + 2,
			top: this.layout.leftSidebarY + 1,
		});
	}

	private createUsernameLabel(): TextRenderable {
		return new TextRenderable(this.renderer, {
			id: "welcome-username",
			content: this.getUsernameText(),
			fg: this.username ? colors.textPrimary : colors.textDim,
			position: "absolute",
			left: this.layout.leftSidebarX + 2,
			top: this.layout.leftSidebarY + 2,
		});
	}

	private getUsernameText(): string {
		if (!this.username) {
			return "Not logged in";
		}

		const maxWidth = this.layout.leftSidebarWidth - 4;
		if (this.username.length > maxWidth) {
			return `${this.username.substring(0, maxWidth - 1)}…`;
		}

		return this.username;
	}

	private createTitle(): TextRenderable {
		return new TextRenderable(this.renderer, {
			id: "library-title",
			content: UI_STRINGS.library,
			fg: colors.textDim,
			position: "absolute",
			left: this.layout.leftSidebarX + 2,
			top: this.layout.leftSidebarY + 4, // After welcome section (lines 1, 2, 3=blank)
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
				top: this.layout.leftSidebarY + 6 + index, // After LIBRARY title
			});
		});
	}

	private formatMenuItem(label: string, isSelected: boolean): string {
		return `${isSelected ? ">" : " "} ${label}`;
	}

	/**
	 * Update username
	 */
	updateUsername(username: string | null): void {
		this.username = username;
		(this.usernameLabel as any).content = this.getUsernameText();
		(this.usernameLabel as any).fg = this.username
			? colors.textPrimary
			: colors.textDim;
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
		this.renderer.root.add(this.welcomeTitle);
		this.renderer.root.add(this.usernameLabel);
		this.renderer.root.add(this.title);
		for (const item of this.menuItems) {
			this.renderer.root.add(item);
		}
	}

	/**
	 * Update layout (for terminal resize)
	 */
	updateLayout(layout: LayoutDimensions): void {
		this.layout = layout;

		// Update container
		(this.container as any).width = layout.leftSidebarWidth;
		(this.container as any).height = layout.leftSidebarHeight;
		(this.container as any).left = layout.leftSidebarX;
		(this.container as any).top = layout.leftSidebarY;

		// Update welcome section
		(this.welcomeTitle as any).left = layout.leftSidebarX + 2;
		(this.welcomeTitle as any).top = layout.leftSidebarY + 1;
		(this.usernameLabel as any).left = layout.leftSidebarX + 2;
		(this.usernameLabel as any).top = layout.leftSidebarY + 2;
		(this.usernameLabel as any).content = this.getUsernameText();

		// Update library title
		(this.title as any).left = layout.leftSidebarX + 2;
		(this.title as any).top = layout.leftSidebarY + 4;

		// Update menu items
		this.menuItems.forEach((item, index) => {
			(item as any).left = layout.leftSidebarX + 2;
			(item as any).top = layout.leftSidebarY + 6 + index;
		});
	}

	/**
	 * Cleanup (no-op for now)
	 */
	destroy(): void {
		// No cleanup needed
	}
}
