import { TextRenderable } from "@opentui/core";
import type { CliRenderer, LayoutDimensions, Track } from "../types";
import { colors } from "../config/colors";
import { UI_STRINGS } from "../config/constants";
import { formatTrackDisplay } from "../data/mock";

/**
 * Queue component showing upcoming tracks
 */
export class Queue {
  private header: TextRenderable;
  private items: TextRenderable[] = [];
  
  private readonly mainContentLeft: number;
  private readonly startTop: number = 8;
  private readonly itemStartTop: number = 10;

  constructor(
    private renderer: CliRenderer,
    private layout: LayoutDimensions,
    private tracks: Track[]
  ) {
    this.mainContentLeft = layout.sidebarWidth + 2;
    
    this.header = this.createHeader();
    this.items = this.createQueueItems();
  }

  private createHeader(): TextRenderable {
    return new TextRenderable(this.renderer, {
      id: "queue-header",
      content: UI_STRINGS.queue,
      fg: colors.textDim,
      position: "absolute",
      left: this.mainContentLeft,
      top: this.startTop,
    });
  }

  private createQueueItems(): TextRenderable[] {
    // Calculate max items that fit in available space
    const maxItems = Math.min(
      this.tracks.length, 
      this.layout.contentHeight - this.itemStartTop - 2
    );

    return this.tracks.slice(0, maxItems).map((track, index) => {
      const isCurrentTrack = index === 0;
      
      return new TextRenderable(this.renderer, {
        id: `queue-item-${index}`,
        content: formatTrackDisplay(track),
        fg: isCurrentTrack ? colors.highlight : colors.textSecondary,
        position: "absolute",
        left: this.mainContentLeft,
        top: this.itemStartTop + index,
      });
    });
  }

  /**
   * Update queue with new tracks
   */
  updateQueue(tracks: Track[]): void {
    this.tracks = tracks;
    // Rebuild queue items...
  }

  /**
   * Add all elements to renderer
   */
  render(): void {
    this.renderer.root.add(this.header);
    this.items.forEach(item => this.renderer.root.add(item));
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    // Remove from renderer if needed
  }
}
