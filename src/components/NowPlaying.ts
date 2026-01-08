import { BoxRenderable, TextRenderable } from "@opentui/core";
import type { CliRenderer, LayoutDimensions, CurrentTrack } from "../types";
import { colors } from "../config/colors";
import { UI_STRINGS } from "../config/constants";

/**
 * Now Playing component showing current track info and progress
 */
export class NowPlaying {
  private container: BoxRenderable;
  private header: TextRenderable;
  private trackTitle: TextRenderable;
  private trackInfo: TextRenderable;
  private progressBar: TextRenderable;
  private timeDisplay: TextRenderable;

  private readonly mainContentLeft: number;

  constructor(
    private renderer: CliRenderer,
    private layout: LayoutDimensions,
    private track: CurrentTrack | null
  ) {
    this.mainContentLeft = layout.sidebarWidth + 2;
    
    this.container = this.createContainer();
    this.header = this.createHeader();
    this.trackTitle = this.createTrackTitle();
    this.trackInfo = this.createTrackInfo();
    this.progressBar = this.createProgressBar();
    this.timeDisplay = this.createTimeDisplay();
  }

  private createContainer(): BoxRenderable {
    return new BoxRenderable(this.renderer, {
      id: "main-content",
      width: this.layout.mainWidth,
      height: this.layout.contentHeight,
      backgroundColor: colors.bg,
      borderStyle: "single",
      borderColor: colors.border,
      position: "absolute",
      left: this.layout.sidebarWidth,
      top: 0,
    });
  }

  private createHeader(): TextRenderable {
    return new TextRenderable(this.renderer, {
      id: "now-playing-header",
      content: UI_STRINGS.nowPlaying,
      fg: colors.textDim,
      position: "absolute",
      left: this.mainContentLeft,
      top: 1,
    });
  }

  private createTrackTitle(): TextRenderable {
    const content = this.track 
      ? `Track: ${this.track.title}` 
      : UI_STRINGS.noTrack;
    
    return new TextRenderable(this.renderer, {
      id: "track-title",
      content,
      fg: colors.textPrimary,
      position: "absolute",
      left: this.mainContentLeft,
      top: 3,
    });
  }

  private createTrackInfo(): TextRenderable {
    const content = this.track
      ? `Artist: ${this.track.artist || "Unknown"} | Album: ${this.track.album || "Unknown"}`
      : "";
    
    return new TextRenderable(this.renderer, {
      id: "track-info",
      content,
      fg: colors.textSecondary,
      position: "absolute",
      left: this.mainContentLeft,
      top: 4,
    });
  }

  private createProgressBar(): TextRenderable {
    const barWidth = Math.max(20, this.layout.mainWidth - 20);
    const content = this.formatProgressBar(barWidth, this.track?.progress || 0);
    
    return new TextRenderable(this.renderer, {
      id: "progress-bar",
      content,
      fg: colors.textSecondary,
      position: "absolute",
      left: this.mainContentLeft,
      top: 6,
    });
  }

  private createTimeDisplay(): TextRenderable {
    const barWidth = Math.max(20, this.layout.mainWidth - 20);
    const content = this.track
      ? `${this.track.currentTime} / ${this.track.totalTime}`
      : "0:00 / 0:00";
    
    return new TextRenderable(this.renderer, {
      id: "time-display",
      content,
      fg: colors.textDim,
      position: "absolute",
      left: this.mainContentLeft + barWidth + 3,
      top: 6,
    });
  }

  private formatProgressBar(width: number, progress: number): string {
    const filled = Math.floor(width * progress);
    return `[${"=".repeat(filled)}${"-".repeat(width - filled)}]`;
  }

  /**
   * Update the current track
   */
  updateTrack(track: CurrentTrack | null): void {
    this.track = track;
    // Update UI elements...
  }

  /**
   * Add all elements to renderer
   */
  render(): void {
    this.renderer.root.add(this.container);
    this.renderer.root.add(this.header);
    this.renderer.root.add(this.trackTitle);
    this.renderer.root.add(this.trackInfo);
    this.renderer.root.add(this.progressBar);
    this.renderer.root.add(this.timeDisplay);
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    // Remove from renderer if needed
  }
}
