import { BoxRenderable, TextRenderable } from "@opentui/core";
import type { CliRenderer, LayoutDimensions, Track } from "../types";
import { colors } from "../config/colors";
import { formatTrackDisplay } from "../data/mock";

/**
 * Content window component - main center area below search bar
 * Displays playlists, albums, tracks, etc. based on current view
 */
export class ContentWindow {
  private container: BoxRenderable;
  private title: TextRenderable;
  private items: TextRenderable[] = [];
  private selectedIndex: number = 0;
  private currentView: "tracks" | "playlists" | "albums" | "artists" = "tracks";

  constructor(
    private renderer: CliRenderer,
    private layout: LayoutDimensions,
    private tracks: Track[] = []
  ) {
    this.container = this.createContainer();
    this.title = this.createTitle();
    this.items = this.createItems();
  }

  private createContainer(): BoxRenderable {
    return new BoxRenderable(this.renderer, {
      id: "content-window",
      width: this.layout.centerWidth,
      height: this.layout.contentWindowHeight,
      backgroundColor: colors.bg,
      borderStyle: "single",
      borderColor: colors.border,
      position: "absolute",
      left: this.layout.centerX,
      top: this.layout.contentWindowY,
    });
  }

  private createTitle(): TextRenderable {
    const titleText = "CONTENT WINDOW";
    return new TextRenderable(this.renderer, {
      id: "content-title",
      content: titleText,
      fg: colors.textDim,
      position: "absolute",
      left: this.layout.centerX + Math.floor((this.layout.centerWidth - titleText.length) / 2),
      top: this.layout.contentWindowY + Math.floor(this.layout.contentWindowHeight / 2),
    });
  }

  private createItems(): TextRenderable[] {
    if (this.tracks.length === 0) {
      return [];
    }

    const maxItems = Math.min(
      this.tracks.length,
      this.layout.contentWindowHeight - 4
    );

    return this.tracks.slice(0, maxItems).map((track, index) => {
      const isSelected = index === this.selectedIndex;
      return new TextRenderable(this.renderer, {
        id: `content-item-${index}`,
        content: `${isSelected ? ">" : " "} ${formatTrackDisplay(track)}`,
        fg: isSelected ? colors.textPrimary : colors.textSecondary,
        position: "absolute",
        left: this.layout.centerX + 2,
        top: this.layout.contentWindowY + 2 + index,
      });
    });
  }

  /**
   * Update the content with new tracks
   */
  updateContent(tracks: Track[]): void {
    this.tracks = tracks;
    // Would need to rebuild items here
  }

  /**
   * Move selection up
   */
  selectPrevious(): void {
    if (this.tracks.length > 0) {
      this.selectedIndex = Math.max(0, this.selectedIndex - 1);
      this.updateItemsDisplay();
    }
  }

  /**
   * Move selection down
   */
  selectNext(): void {
    if (this.tracks.length > 0) {
      this.selectedIndex = Math.min(this.tracks.length - 1, this.selectedIndex + 1);
      this.updateItemsDisplay();
    }
  }

  private updateItemsDisplay(): void {
    this.items.forEach((item, index) => {
      const isSelected = index === this.selectedIndex;
      const track = this.tracks[index];
      if (track) {
        (item as any).content = `${isSelected ? ">" : " "} ${formatTrackDisplay(track)}`;
        (item as any).fg = isSelected ? colors.textPrimary : colors.textSecondary;
      }
    });
  }

  /**
   * Add all elements to renderer
   */
  render(): void {
    this.renderer.root.add(this.container);
    this.renderer.root.add(this.title);
    this.items.forEach(item => this.renderer.root.add(item));
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    // Remove from renderer if needed
  }
}
