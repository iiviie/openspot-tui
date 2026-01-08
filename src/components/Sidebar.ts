import { BoxRenderable, TextRenderable } from "@opentui/core";
import type { CliRenderer, LayoutDimensions, MenuItem } from "../types";
import { colors } from "../config/colors";
import { UI_STRINGS, LIBRARY_MENU_ITEMS } from "../config/constants";

/**
 * Sidebar component displaying the library menu (left side)
 */
export class Sidebar {
  private container: BoxRenderable;
  private title: TextRenderable;
  private menuItems: TextRenderable[] = [];
  private selectedIndex: number = 0;
  private readonly items: MenuItem[];

  constructor(
    private renderer: CliRenderer,
    private layout: LayoutDimensions,
    items: MenuItem[] = LIBRARY_MENU_ITEMS
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
      borderColor: colors.border,
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
    this.selectedIndex = Math.min(this.items.length - 1, this.selectedIndex + 1);
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

  private updateMenuDisplay(): void {
    this.menuItems.forEach((item, index) => {
      const isSelected = index === this.selectedIndex;
      const menuItem = this.items[index];
      
      // Update content and color using any cast (OpenTUI API limitation)
      (item as any).setContent?.(this.formatMenuItem(menuItem.label, isSelected));
      (item as any).setFg?.(isSelected ? colors.textPrimary : colors.textSecondary);
    });
  }

  /**
   * Add all elements to renderer
   */
  render(): void {
    this.renderer.root.add(this.container);
    this.renderer.root.add(this.title);
    this.menuItems.forEach(item => this.renderer.root.add(item));
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    // Remove from renderer if needed
  }
}
