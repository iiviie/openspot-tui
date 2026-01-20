import { BoxRenderable, TextRenderable } from "@opentui/core";
import { colors } from "../config/colors";
import { LIBRARY_MENU_ITEMS, UI_STRINGS } from "../config/constants";
import type { CliRenderer, LayoutDimensions, MenuItem } from "../types";
import { typedBox, typedText, TypedBox, TypedText } from "../ui";

/**
 * Queue item interface
 */
export interface QueueItem {
	uri: string;
	title: string;
	artist: string;
}

/**
 * Sidebar component displaying welcome section + library menu + queue (left side)
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

	// Queue section
	private queueTitle: TextRenderable;
	private queueItems: TextRenderable[] = [];
	private queue: QueueItem[] = [];
	private readonly MAX_QUEUE_DISPLAY = 5;

	// Typed wrappers for type-safe updates
	private typedContainer: TypedBox;
	private typedWelcomeTitle: TypedText;
	private typedUsernameLabel: TypedText;
	private typedTitle: TypedText;
	private typedMenuItems: TypedText[] = [];
	private typedQueueTitle: TypedText;
	private typedQueueItems: TypedText[] = [];

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
		this.queueTitle = this.createQueueTitle();
		this.queueItems = this.createQueueItems();

		// Wrap renderables for type-safe updates
		this.typedContainer = typedBox(this.container);
		this.typedWelcomeTitle = typedText(this.welcomeTitle);
		this.typedUsernameLabel = typedText(this.usernameLabel);
		this.typedTitle = typedText(this.title);
		this.typedMenuItems = this.menuItems.map((item) => typedText(item));
		this.typedQueueTitle = typedText(this.queueTitle);
		this.typedQueueItems = this.queueItems.map((item) => typedText(item));
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
	 * Calculate the starting Y position for queue section
	 * Queue appears after: welcome (2 lines) + blank + LIBRARY title + menu items
	 */
	private getQueueStartY(): number {
		// Lines: 1=WELCOME, 2=username, 3=blank, 4=LIBRARY, 5=blank, 6-9=menu items (4 items), 10=blank, 11=QUEUE
		return this.layout.leftSidebarY + 6 + this.items.length + 2;
	}

	private createQueueTitle(): TextRenderable {
		return new TextRenderable(this.renderer, {
			id: "queue-title",
			content: "QUEUE",
			fg: colors.textDim,
			position: "absolute",
			left: this.layout.leftSidebarX + 2,
			top: this.getQueueStartY(),
		});
	}

	private createQueueItems(): TextRenderable[] {
		const startY = this.getQueueStartY() + 1;
		const items: TextRenderable[] = [];

		for (let i = 0; i < this.MAX_QUEUE_DISPLAY; i++) {
			items.push(
				new TextRenderable(this.renderer, {
					id: `sidebar-queue-item-${i}`,
					content: "",
					fg: colors.textSecondary,
					position: "absolute",
					left: this.layout.leftSidebarX + 2,
					top: startY + i,
				}),
			);
		}
		return items;
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

	// ─────────────────────────────────────────────────────────────
	// Queue Management
	// ─────────────────────────────────────────────────────────────

	/**
	 * Add a track to the queue
	 */
	addToQueue(item: QueueItem): void {
		this.queue.push(item);
		this.updateQueueDisplay();
	}

	/**
	 * Remove first item from queue (after playing)
	 */
	dequeue(): QueueItem | undefined {
		const item = this.queue.shift();
		this.updateQueueDisplay();
		return item;
	}

	/**
	 * Get the current queue
	 */
	getQueue(): QueueItem[] {
		return [...this.queue];
	}

	/**
	 * Clear the queue
	 */
	clearQueue(): void {
		this.queue = [];
		this.updateQueueDisplay();
	}

	/**
	 * Check if queue has items
	 */
	hasQueuedItems(): boolean {
		return this.queue.length > 0;
	}

	/**
	 * Get next track from queue without removing
	 */
	peekQueue(): QueueItem | undefined {
		return this.queue[0];
	}

	private updateQueueDisplay(): void {
		const maxWidth = this.layout.leftSidebarWidth - 4;

		for (let i = 0; i < this.typedQueueItems.length; i++) {
			if (i < this.queue.length) {
				const item = this.queue[i];
				const num = `${i + 1}. `;
				let content = `${num}${item.title}`;

				// Truncate if needed
				if (content.length > maxWidth) {
					content = `${content.substring(0, maxWidth - 1)}…`;
				}

				this.typedQueueItems[i].update({
					content,
					fg: i === 0 ? colors.accent : colors.textSecondary,
				});
			} else if (i === 0 && this.queue.length === 0) {
				this.typedQueueItems[i].update({
					content: "(empty)",
					fg: colors.textDim,
				});
			} else {
				this.typedQueueItems[i].update({ content: "" });
			}
		}
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
		// Render queue section
		this.renderer.root.add(this.queueTitle);
		for (const item of this.queueItems) {
			this.renderer.root.add(item);
		}
		// Initial queue display
		this.updateQueueDisplay();
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

		// Update queue section
		const queueStartY = this.getQueueStartY();
		this.typedQueueTitle.update({
			left: layout.leftSidebarX + 2,
			top: queueStartY,
		});

		this.typedQueueItems.forEach((item, index) => {
			item.update({
				left: layout.leftSidebarX + 2,
				top: queueStartY + 1 + index,
			});
		});

		// Refresh queue display with new dimensions
		this.updateQueueDisplay();
	}

	/**
	 * Cleanup (no-op for now)
	 */
	destroy(): void {
		// No cleanup needed
	}
}
