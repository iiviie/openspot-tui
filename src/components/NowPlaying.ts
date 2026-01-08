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
  private playingStatus: TextRenderable;

  private readonly mainContentLeft: number;
  private readonly barWidth: number;

  constructor(
    private renderer: CliRenderer,
    private layout: LayoutDimensions,
    private track: CurrentTrack | null
  ) {
    this.mainContentLeft = layout.sidebarWidth + 2;
    this.barWidth = Math.max(20, this.layout.mainWidth - 25);
    
    this.container = this.createContainer();
    this.header = this.createHeader();
    this.playingStatus = this.createPlayingStatus();
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

  private createPlayingStatus(): TextRenderable {
    const icon = this.track?.isPlaying ? "▶" : "⏸";
    return new TextRenderable(this.renderer, {
      id: "playing-status",
      content: icon,
      fg: colors.accent,
      position: "absolute",
      left: this.mainContentLeft,
      top: 3,
    });
  }

  private createTrackTitle(): TextRenderable {
    const content = this.track 
      ? this.track.title 
      : UI_STRINGS.noTrack;
    
    return new TextRenderable(this.renderer, {
      id: "track-title",
      content,
      fg: colors.textPrimary,
      position: "absolute",
      left: this.mainContentLeft + 2,
      top: 3,
    });
  }

  private createTrackInfo(): TextRenderable {
    const content = this.track
      ? `${this.track.artist || "Unknown"} • ${this.track.album || "Unknown"}`
      : "";
    
    return new TextRenderable(this.renderer, {
      id: "track-info",
      content,
      fg: colors.textSecondary,
      position: "absolute",
      left: this.mainContentLeft + 2,
      top: 4,
    });
  }

  private createProgressBar(): TextRenderable {
    const content = this.formatProgressBar(this.track?.progress || 0);
    
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
    const content = this.track
      ? `${this.track.currentTime} / ${this.track.totalTime}`
      : "0:00 / 0:00";
    
    return new TextRenderable(this.renderer, {
      id: "time-display",
      content,
      fg: colors.textDim,
      position: "absolute",
      left: this.mainContentLeft + this.barWidth + 3,
      top: 6,
    });
  }

  private formatProgressBar(progress: number): string {
    const filled = Math.floor(this.barWidth * progress);
    const empty = this.barWidth - filled;
    return `[${"█".repeat(filled)}${"░".repeat(empty)}]`;
  }

  /**
   * Update the current track and refresh display
   */
  updateTrack(track: CurrentTrack | null): void {
    this.track = track;
    
    // Update playing status
    const icon = this.track?.isPlaying ? "▶" : "⏸";
    (this.playingStatus as any).content = icon;

    // Update track title
    const title = this.track ? this.track.title : UI_STRINGS.noTrack;
    (this.trackTitle as any).content = title;

    // Update track info
    const info = this.track
      ? `${this.track.artist || "Unknown"} • ${this.track.album || "Unknown"}`
      : "";
    (this.trackInfo as any).content = info;

    // Update progress bar
    (this.progressBar as any).content = this.formatProgressBar(this.track?.progress || 0);

    // Update time display
    const time = this.track
      ? `${this.track.currentTime} / ${this.track.totalTime}`
      : "0:00 / 0:00";
    (this.timeDisplay as any).content = time;
  }

  /**
   * Add all elements to renderer
   */
  render(): void {
    this.renderer.root.add(this.container);
    this.renderer.root.add(this.header);
    this.renderer.root.add(this.playingStatus);
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
