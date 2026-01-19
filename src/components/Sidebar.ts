import { BoxRenderable, TextRenderable } from "@opentui/core";
import { colors } from "../config/colors";
import { LIBRARY_MENU_ITEMS, UI_STRINGS } from "../config/constants";
import type { CliRenderer, LayoutDimensions, MenuItem } from "../types";
import { typedBox, typedText, TypedBox, TypedText } from "../ui";

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

	// Typed wrappers for type-safe updates
	private typedContainer: TypedBox;
	private typedWelcomeTitle: TypedText;
	private typedUsernameLabel: TypedText;
	private typedTitle: TypedText;
	private typedMenuItems: TypedText[] = [];

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

		// Wrap renderables for type-safe updates
		this.typedContainer = typedBox(this.container);
		this.typedWelcomeTitle = typedText(this.welcomeTitle);
		this.typedUsernameLabel = typedText(this.usernameLabel);
		this.typedTitle = typedText(this.title);
		this.typedMenuItems = this.menuItems.map((item) => typedText(item));
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
		this.typedUsernameLabel.update({
			content: this.getUsernameText(),
			fg: this.username ? colors.textPrimary : colors.textDim,
		});
	}

	/**
	 * Set focus state (highlights border)
	 */
	setFocused(focused: boolean): void {
		this.isFocused = focused;
		this.typedContainer.update({
			borderColor: focused ? colors.accent : colors.border,
		});
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

			this.typedMenuItems[index].update({
				content: this.formatMenuItem(menuItem.label, isSelected),
				fg: isSelected ? colors.textPrimary : colors.textSecondary,
			});
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
		this.typedContainer.update({
			width: layout.leftSidebarWidth,
			height: layout.leftSidebarHeight,
			left: layout.leftSidebarX,
			top: layout.leftSidebarY,
		});

		// Update welcome section
		this.typedWelcomeTitle.update({
			left: layout.leftSidebarX + 2,
			top: layout.leftSidebarY + 1,
		});

		this.typedUsernameLabel.update({
			left: layout.leftSidebarX + 2,
			top: layout.leftSidebarY + 2,
			content: this.getUsernameText(),
		});

		// Update library title
		this.typedTitle.update({
			left: layout.leftSidebarX + 2,
			top: layout.leftSidebarY + 4,
		});

		// Update menu items
		this.menuItems.forEach((item, index) => {
			this.typedMenuItems[index].update({
				left: layout.leftSidebarX + 2,
				top: layout.leftSidebarY + 6 + index,
			});
		});
	}

	/**
	 * Cleanup (no-op for now)
	 */
	destroy(): void {
		// No cleanup needed
	}
}
