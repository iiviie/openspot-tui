import { BoxRenderable, TextRenderable } from "@opentui/core";
import type { CliRenderer, LayoutDimensions, CurrentTrack } from "../types";
import { colors } from "../config/colors";
import { UI_STRINGS } from "../config/constants";

/**
 * Now Playing component - full width bar at the bottom
 * Shows current track info, progress bar, and time
 */
export class NowPlaying {
  private container: BoxRenderable;
  private playingStatus: TextRenderable;
  private trackTitle: TextRenderable;
  private trackInfo: TextRenderable;
  private progressBar: TextRenderable;
  private timeDisplay: TextRenderable;

  private readonly barWidth: number;

  constructor(
    private renderer: CliRenderer,
    private layout: LayoutDimensions,
    private track: CurrentTrack | null
  ) {
    // Progress bar takes up most of the width, leaving room for time display
    this.barWidth = Math.max(20, this.layout.termWidth - 40);
    
    this.container = this.createContainer();
    this.playingStatus = this.createPlayingStatus();
    this.trackTitle = this.createTrackTitle();
    this.trackInfo = this.createTrackInfo();
    this.progressBar = this.createProgressBar();
    this.timeDisplay = this.createTimeDisplay();
  }

  private createContainer(): BoxRenderable {
    return new BoxRenderable(this.renderer, {
      id: "now-playing-bar",
      width: this.layout.termWidth,
      height: this.layout.nowPlayingHeight,
      backgroundColor: colors.bgSecondary,
      borderStyle: "single",
      borderColor: colors.border,
      position: "absolute",
      left: 0,
      top: this.layout.nowPlayingY,
    });
  }

  private createPlayingStatus(): TextRenderable {
    const icon = this.track?.isPlaying ? ">" : "||";
    return new TextRenderable(this.renderer, {
      id: "playing-status",
      content: icon,
      fg: colors.accent,
      position: "absolute",
      left: 2,
      top: this.layout.nowPlayingY + 1,
    });
  }

  private createTrackTitle(): TextRenderable {
    const content = this.track 
      ? this.track.title 
      : UI_STRINGS.noTrack;
    
    return new TextRenderable(this.renderer, {
      id: "track-title",
      content: this.truncate(content, 40),
      fg: colors.textPrimary,
      position: "absolute",
      left: 6,
      top: this.layout.nowPlayingY + 1,
    });
  }

  private createTrackInfo(): TextRenderable {
    const content = this.track
      ? `${this.track.artist || "Unknown"} - ${this.track.album || "Unknown"}`
      : "";
    
    return new TextRenderable(this.renderer, {
      id: "track-info",
      content: this.truncate(content, 50),
      fg: colors.textSecondary,
      position: "absolute",
      left: 6,
      top: this.layout.nowPlayingY + 2,
    });
  }

  private createProgressBar(): TextRenderable {
    const content = this.formatProgressBar(this.track?.progress || 0);
    
    return new TextRenderable(this.renderer, {
      id: "progress-bar",
      content,
      fg: colors.textSecondary,
      position: "absolute",
      left: 6,
      top: this.layout.nowPlayingY + 3,
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
      left: this.barWidth + 10,
      top: this.layout.nowPlayingY + 3,
    });
  }

  private formatProgressBar(progress: number): string {
    const width = Math.min(this.barWidth, this.layout.termWidth - 30);
    const filled = Math.floor(width * progress);
    const empty = width - filled;
    return `[${"=".repeat(filled)}${"-".repeat(empty)}]`;
  }

  private truncate(str: string, maxLength: number): string {
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength - 3) + "...";
  }

  /**
   * Update the current track and refresh display
   */
  updateTrack(track: CurrentTrack | null): void {
    this.track = track;
    
    // Update playing status
    const icon = this.track?.isPlaying ? ">" : "||";
    (this.playingStatus as any).content = icon;

    // Update track title
    const title = this.track ? this.track.title : UI_STRINGS.noTrack;
    (this.trackTitle as any).content = this.truncate(title, 40);

    // Update track info
    const info = this.track
      ? `${this.track.artist || "Unknown"} - ${this.track.album || "Unknown"}`
      : "";
    (this.trackInfo as any).content = this.truncate(info, 50);

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
