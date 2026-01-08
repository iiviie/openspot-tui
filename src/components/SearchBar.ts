import { BoxRenderable, TextRenderable } from "@opentui/core";
import type { CliRenderer, LayoutDimensions } from "../types";
import { colors } from "../config/colors";

/**
 * Search bar component at the top center of the layout
 * Supports text input mode for searching
 */
export class SearchBar {
  private container: BoxRenderable;
  private label: TextRenderable;
  private searchText: string = "";
  private isActive: boolean = false;
  private cursorVisible: boolean = true;
  private cursorInterval: Timer | null = null;

  // Callback when search is submitted
  public onSearch: ((query: string) => void) | null = null;

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
    const content = this.getDisplayContent();
    return new TextRenderable(this.renderer, {
      id: "search-label",
      content,
      fg: this.searchText ? colors.textPrimary : colors.textDim,
      position: "absolute",
      left: this.layout.centerX + 2,
      top: this.layout.searchBarY + 1,
    });
  }

  private getDisplayContent(): string {
    if (this.isActive) {
      const cursor = this.cursorVisible ? "|" : " ";
      return `/ ${this.searchText}${cursor}`;
    }
    if (this.searchText) {
      return `/ ${this.searchText}`;
    }
    return "Press / to search...";
  }

  /**
   * Activate search mode (start typing)
   */
  activate(): void {
    this.isActive = true;
    this.startCursorBlink();
    this.updateDisplay();
  }

  /**
   * Deactivate search mode
   */
  deactivate(): void {
    this.isActive = false;
    this.stopCursorBlink();
    this.updateDisplay();
  }

  /**
   * Check if search is active
   */
  isSearchActive(): boolean {
    return this.isActive;
  }

  /**
   * Handle a character input
   */
  handleChar(char: string): void {
    if (!this.isActive) return;
    this.searchText += char;
    this.updateDisplay();
  }

  /**
   * Handle backspace
   */
  handleBackspace(): void {
    if (!this.isActive) return;
    this.searchText = this.searchText.slice(0, -1);
    this.updateDisplay();
  }

  /**
   * Handle enter (submit search)
   */
  handleEnter(): void {
    if (!this.isActive) return;
    if (this.searchText.trim() && this.onSearch) {
      this.onSearch(this.searchText.trim());
    }
    this.deactivate();
  }

  /**
   * Handle escape (cancel search)
   */
  handleEscape(): void {
    this.searchText = "";
    this.deactivate();
  }

  /**
   * Get current search text
   */
  getSearchText(): string {
    return this.searchText;
  }

  /**
   * Clear search text
   */
  clear(): void {
    this.searchText = "";
    this.updateDisplay();
  }

  private startCursorBlink(): void {
    this.cursorVisible = true;
    this.cursorInterval = setInterval(() => {
      this.cursorVisible = !this.cursorVisible;
      this.updateDisplay();
    }, 500);
  }

  private stopCursorBlink(): void {
    if (this.cursorInterval) {
      clearInterval(this.cursorInterval);
      this.cursorInterval = null;
    }
    this.cursorVisible = true;
  }

  private updateDisplay(): void {
    const content = this.getDisplayContent();
    (this.label as any).content = content;
    (this.label as any).fg = this.searchText || this.isActive ? colors.textPrimary : colors.textDim;
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
    this.stopCursorBlink();
  }
}
