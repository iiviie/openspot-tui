import { BoxRenderable, TextRenderable } from "@opentui/core";
import type { CliRenderer, LayoutDimensions, CurrentTrack } from "../types";
import { colors } from "../config/colors";

/**
 * Status sidebar component (right side)
 * Shows playback status, volume, shuffle/repeat state, controls help
 */
export class StatusSidebar {
  private container: BoxRenderable;
  private title: TextRenderable;
  private playbackStatus: TextRenderable;
  private volumeLabel: TextRenderable;
  private shuffleLabel: TextRenderable;
  private repeatLabel: TextRenderable;
  private controlsHelp: TextRenderable[];

  constructor(
    private renderer: CliRenderer,
    private layout: LayoutDimensions,
    private track: CurrentTrack | null = null,
    private volume: number = 100,
    private shuffle: boolean = false,
    private repeat: string = "None"
  ) {
    this.container = this.createContainer();
    this.title = this.createTitle();
    this.playbackStatus = this.createPlaybackStatus();
    this.volumeLabel = this.createVolumeLabel();
    this.shuffleLabel = this.createShuffleLabel();
    this.repeatLabel = this.createRepeatLabel();
    this.controlsHelp = this.createControlsHelp();
  }

  private createContainer(): BoxRenderable {
    return new BoxRenderable(this.renderer, {
      id: "status-sidebar",
      width: this.layout.rightSidebarWidth,
      height: this.layout.rightSidebarHeight,
      backgroundColor: colors.bg,
      borderStyle: "single",
      borderColor: colors.border,
      position: "absolute",
      left: this.layout.rightSidebarX,
      top: this.layout.rightSidebarY,
    });
  }

  private createTitle(): TextRenderable {
    return new TextRenderable(this.renderer, {
      id: "status-title",
      content: "STATUS",
      fg: colors.textDim,
      position: "absolute",
      left: this.layout.rightSidebarX + 2,
      top: this.layout.rightSidebarY + 1,
    });
  }

  private createPlaybackStatus(): TextRenderable {
    const icon = this.track?.isPlaying ? "Playing" : "Paused";
    return new TextRenderable(this.renderer, {
      id: "playback-status",
      content: icon,
      fg: this.track?.isPlaying ? colors.accent : colors.textSecondary,
      position: "absolute",
      left: this.layout.rightSidebarX + 2,
      top: this.layout.rightSidebarY + 3,
    });
  }

  private createVolumeLabel(): TextRenderable {
    return new TextRenderable(this.renderer, {
      id: "volume-label",
      content: `Vol: ${this.volume}%`,
      fg: colors.textSecondary,
      position: "absolute",
      left: this.layout.rightSidebarX + 2,
      top: this.layout.rightSidebarY + 5,
    });
  }

  private createShuffleLabel(): TextRenderable {
    return new TextRenderable(this.renderer, {
      id: "shuffle-label",
      content: `Shuffle: ${this.shuffle ? "On" : "Off"}`,
      fg: this.shuffle ? colors.accent : colors.textDim,
      position: "absolute",
      left: this.layout.rightSidebarX + 2,
      top: this.layout.rightSidebarY + 6,
    });
  }

  private createRepeatLabel(): TextRenderable {
    return new TextRenderable(this.renderer, {
      id: "repeat-label",
      content: `Repeat: ${this.repeat}`,
      fg: this.repeat !== "None" ? colors.accent : colors.textDim,
      position: "absolute",
      left: this.layout.rightSidebarX + 2,
      top: this.layout.rightSidebarY + 7,
    });
  }

  private createControlsHelp(): TextRenderable[] {
    const controls = [
      "--- Controls ---",
      "Space: Play/Pause",
      "n: Next track",
      "p: Previous",
      "+/-: Volume",
      "s: Shuffle",
      "r: Repeat",
      "q: Quit",
    ];

    const startY = this.layout.rightSidebarY + 9;
    return controls.map((text, index) => {
      return new TextRenderable(this.renderer, {
        id: `control-help-${index}`,
        content: text,
        fg: index === 0 ? colors.textDim : colors.textSecondary,
        position: "absolute",
        left: this.layout.rightSidebarX + 2,
        top: startY + index,
      });
    });
  }

  /**
   * Update status info
   */
  updateStatus(
    track: CurrentTrack | null,
    volume?: number,
    shuffle?: boolean,
    repeat?: string
  ): void {
    this.track = track;
    if (volume !== undefined) this.volume = volume;
    if (shuffle !== undefined) this.shuffle = shuffle;
    if (repeat !== undefined) this.repeat = repeat;

    // Update playback status
    const playIcon = this.track?.isPlaying ? "Playing" : "Paused";
    (this.playbackStatus as any).content = playIcon;
    (this.playbackStatus as any).fg = this.track?.isPlaying ? colors.accent : colors.textSecondary;

    // Update volume
    (this.volumeLabel as any).content = `Vol: ${this.volume}%`;

    // Update shuffle
    (this.shuffleLabel as any).content = `Shuffle: ${this.shuffle ? "On" : "Off"}`;
    (this.shuffleLabel as any).fg = this.shuffle ? colors.accent : colors.textDim;

    // Update repeat
    (this.repeatLabel as any).content = `Repeat: ${this.repeat}`;
    (this.repeatLabel as any).fg = this.repeat !== "None" ? colors.accent : colors.textDim;
  }

  /**
   * Add all elements to renderer
   */
  render(): void {
    this.renderer.root.add(this.container);
    this.renderer.root.add(this.title);
    this.renderer.root.add(this.playbackStatus);
    this.renderer.root.add(this.volumeLabel);
    this.renderer.root.add(this.shuffleLabel);
    this.renderer.root.add(this.repeatLabel);
    this.controlsHelp.forEach(item => this.renderer.root.add(item));
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    // Remove from renderer if needed
  }
}
