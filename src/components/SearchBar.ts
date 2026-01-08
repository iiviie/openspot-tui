import { BoxRenderable, TextRenderable } from "@opentui/core";
import type { CliRenderer, LayoutDimensions } from "../types";
import { colors } from "../config/colors";

/**
 * Search bar component at the top center of the layout
 */
export class SearchBar {
  private container: BoxRenderable;
  private label: TextRenderable;
  private searchText: string = "";

  constructor(
    private renderer: CliRenderer,
    private layout: LayoutDimensions
  ) {
    this.container = this.createContainer();
    this.label = this.createLabel();
  }

  private createContainer(): BoxRenderable {
    return new BoxRenderable(this.renderer, {
      id: "search-bar",
      width: this.layout.centerWidth,
      height: this.layout.searchBarHeight,
      backgroundColor: colors.bgSecondary,
      borderStyle: "single",
      borderColor: colors.border,
      position: "absolute",
      left: this.layout.centerX,
      top: this.layout.searchBarY,
    });
  }

  private createLabel(): TextRenderable {
    const placeholder = this.searchText || "SEARCH BAR";
    return new TextRenderable(this.renderer, {
      id: "search-label",
      content: placeholder,
      fg: colors.textDim,
      position: "absolute",
      left: this.layout.centerX + Math.floor((this.layout.centerWidth - placeholder.length) / 2),
      top: this.layout.searchBarY + 1,
    });
  }

  /**
   * Update search text (for future implementation)
   */
  updateSearch(text: string): void {
    this.searchText = text;
    const content = text || "SEARCH BAR";
    (this.label as any).content = content;
  }

  /**
   * Add all elements to renderer
   */
  render(): void {
    this.renderer.root.add(this.container);
    this.renderer.root.add(this.label);
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    // Remove from renderer if needed
  }
}
