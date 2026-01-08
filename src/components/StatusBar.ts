import { BoxRenderable, TextRenderable } from "@opentui/core";
import type { CliRenderer, LayoutDimensions, CurrentTrack } from "../types";
import { colors } from "../config/colors";
import { UI_STRINGS } from "../config/constants";

/**
 * Status bar component at the bottom of the screen
 */
export class StatusBar {
  private container: BoxRenderable;
  private statusText: TextRenderable;
  private controls: TextRenderable;

  constructor(
    private renderer: CliRenderer,
    private layout: LayoutDimensions,
    private track: CurrentTrack | null
  ) {
    this.container = this.createContainer();
    this.statusText = this.createStatusText();
    this.controls = this.createControls();
  }

  private createContainer(): BoxRenderable {
    return new BoxRenderable(this.renderer, {
      id: "status-bar",
      width: this.layout.termWidth,
      height: this.layout.statusBarHeight,
      backgroundColor: colors.bgSecondary,
      borderStyle: "single",
      borderColor: colors.border,
      position: "absolute",
      left: 0,
      top: this.layout.contentHeight,
    });
  }

  private createStatusText(): TextRenderable {
    const content = this.track
      ? `Playing: ${this.track.title} - ${this.track.artist || "Unknown"}`
      : "No track playing";

    return new TextRenderable(this.renderer, {
      id: "status-text",
      content,
      fg: colors.textSecondary,
      position: "absolute",
      left: 2,
      top: this.layout.contentHeight + 1,
    });
  }

  private createControls(): TextRenderable {
    return new TextRenderable(this.renderer, {
      id: "controls",
      content: UI_STRINGS.controls,
      fg: colors.textDim,
      position: "absolute",
      left: this.layout.termWidth - 22,
      top: this.layout.contentHeight + 1,
    });
  }

  /**
   * Update status with new track info
   */
  updateTrack(track: CurrentTrack | null): void {
    this.track = track;
    // Update status text...
  }

  /**
   * Add all elements to renderer
   */
  render(): void {
    this.renderer.root.add(this.container);
    this.renderer.root.add(this.statusText);
    this.renderer.root.add(this.controls);
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    // Remove from renderer if needed
  }
}
