import { BoxRenderable, TextRenderable } from "@opentui/core";
import type { CliRenderer, LayoutDimensions } from "../types";
import type { SpotifyTrack } from "../types/spotify";
import { colors } from "../config/colors";

/**
 * Search result item for display
 */
export interface SearchResultItem {
  uri: string;
  title: string;
  artist: string;
  album: string;
  duration: string;
}

/**
 * Content window component - main center area below search bar
 * Displays search results, playlists, albums, tracks, etc.
 */
export class ContentWindow {
  private container: BoxRenderable;
  private headerText: TextRenderable;
  private items: TextRenderable[] = [];
  private selectedIndex: number = 0;
  private results: SearchResultItem[] = [];
  private isLoading: boolean = false;
  private statusMessage: string = "";

  // Callback when a track is selected for playback
  public onTrackSelect: ((uri: string) => void) | null = null;

  constructor(
    private renderer: CliRenderer,
    private layout: LayoutDimensions
  ) {
    this.container = this.createContainer();
    this.headerText = this.createHeader();
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

  private createHeader(): TextRenderable {
    return new TextRenderable(this.renderer, {
      id: "content-header",
      content: "",
      fg: colors.textDim,
      position: "absolute",
      left: this.layout.centerX + 2,
      top: this.layout.contentWindowY + 1,
    });
  }

  /**
   * Show loading state
   */
  setLoading(loading: boolean): void {
    this.isLoading = loading;
    if (loading) {
      this.statusMessage = "Searching...";
      this.updateHeaderDisplay();
      this.clearItems();
    }
  }

  /**
   * Set a status message (error, no results, etc.)
   */
  setStatus(message: string): void {
    this.statusMessage = message;
    this.updateHeaderDisplay();
  }

  /**
   * Update search results from Spotify tracks
   */
  updateResults(tracks: SpotifyTrack[]): void {
    this.isLoading = false;
    this.selectedIndex = 0;
    
    this.results = tracks.map(track => ({
      uri: track.uri,
      title: track.name,
      artist: track.artists.map(a => a.name).join(", "),
      album: track.album.name,
      duration: this.formatDuration(track.duration_ms),
    }));

    if (this.results.length === 0) {
      this.statusMessage = "No results found";
    } else {
      this.statusMessage = `Found ${this.results.length} tracks`;
    }

    this.updateHeaderDisplay();
    this.rebuildItems();
  }

  /**
   * Clear all results
   */
  clearResults(): void {
    this.results = [];
    this.selectedIndex = 0;
    this.statusMessage = "";
    this.updateHeaderDisplay();
    this.clearItems();
  }

  private formatDuration(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }

  private updateHeaderDisplay(): void {
    (this.headerText as any).content = this.statusMessage;
  }

  private clearItems(): void {
    // Clear existing items by setting empty content
    this.items.forEach((item, index) => {
      (item as any).content = "";
    });
  }

  private rebuildItems(): void {
    // Calculate how many items can fit
    const maxItems = Math.min(
      this.results.length,
      this.layout.contentWindowHeight - 4
    );

    // Ensure we have enough TextRenderable items
    while (this.items.length < maxItems) {
      const item = new TextRenderable(this.renderer, {
        id: `content-item-${this.items.length}`,
        content: "",
        fg: colors.textSecondary,
        position: "absolute",
        left: this.layout.centerX + 2,
        top: this.layout.contentWindowY + 3 + this.items.length,
      });
      this.items.push(item);
      this.renderer.root.add(item);
    }

    // Update item contents
    for (let i = 0; i < this.items.length; i++) {
      if (i < this.results.length) {
        const result = this.results[i];
        const isSelected = i === this.selectedIndex;
        const prefix = isSelected ? "> " : "  ";
        const maxWidth = this.layout.centerWidth - 6;
        
        // Format: > Title - Artist (Duration)
        let content = `${prefix}${result.title} - ${result.artist}`;
        const duration = ` [${result.duration}]`;
        
        // Truncate if needed
        if (content.length + duration.length > maxWidth) {
          content = content.substring(0, maxWidth - duration.length - 3) + "...";
        }
        content += duration;

        (this.items[i] as any).content = content;
        (this.items[i] as any).fg = isSelected ? colors.textPrimary : colors.textSecondary;
      } else {
        (this.items[i] as any).content = "";
      }
    }
  }

  /**
   * Move selection up
   */
  selectPrevious(): void {
    if (this.results.length > 0) {
      this.selectedIndex = Math.max(0, this.selectedIndex - 1);
      this.rebuildItems();
    }
  }

  /**
   * Move selection down
   */
  selectNext(): void {
    if (this.results.length > 0) {
      this.selectedIndex = Math.min(this.results.length - 1, this.selectedIndex + 1);
      this.rebuildItems();
    }
  }

  /**
   * Get currently selected result
   */
  getSelectedResult(): SearchResultItem | null {
    if (this.results.length === 0) return null;
    return this.results[this.selectedIndex];
  }

  /**
   * Select current item (trigger playback)
   */
  selectCurrent(): void {
    const selected = this.getSelectedResult();
    if (selected && this.onTrackSelect) {
      this.onTrackSelect(selected.uri);
    }
  }

  /**
   * Check if there are results to navigate
   */
  hasResults(): boolean {
    return this.results.length > 0;
  }

  /**
   * Add all elements to renderer
   */
  render(): void {
    this.renderer.root.add(this.container);
    this.renderer.root.add(this.headerText);
    // Items are added dynamically in rebuildItems
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    // Remove from renderer if needed
  }
}
