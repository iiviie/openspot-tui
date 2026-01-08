import { BoxRenderable, TextRenderable } from "@opentui/core";
import type { CliRenderer, LayoutDimensions, CurrentTrack } from "../types";
import { colors } from "../config/colors";

/**
 * Queue item interface
 */
export interface QueueItem {
  uri: string;
  title: string;
  artist: string;
}

/**
 * Status sidebar component (right side)
 * Shows playback status, volume, shuffle/repeat state, and queue
 */
export class StatusSidebar {
  private container: BoxRenderable;
  private title: TextRenderable;
  private playbackStatus: TextRenderable;
  private volumeLabel: TextRenderable;
  private shuffleLabel: TextRenderable;
  private repeatLabel: TextRenderable;
  private queueTitle: TextRenderable;
  private queueItems: TextRenderable[] = [];
  private queue: QueueItem[] = [];

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
    this.queueTitle = this.createQueueTitle();
    this.queueItems = this.createQueueItems();
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

  private createQueueTitle(): TextRenderable {
    return new TextRenderable(this.renderer, {
      id: "queue-title",
      content: "QUEUE",
      fg: colors.textDim,
      position: "absolute",
      left: this.layout.rightSidebarX + 2,
      top: this.layout.rightSidebarY + 9,
    });
  }

  private createQueueItems(): TextRenderable[] {
    // Calculate how many queue items can fit
    const startY = this.layout.rightSidebarY + 11;
    const availableHeight = this.layout.rightSidebarHeight - 13;
    const maxQueueDisplay = Math.max(0, availableHeight);

    const items: TextRenderable[] = [];
    for (let i = 0; i < maxQueueDisplay; i++) {
      items.push(
        new TextRenderable(this.renderer, {
          id: `queue-item-${i}`,
          content: "",
          fg: colors.textSecondary,
          position: "absolute",
          left: this.layout.rightSidebarX + 2,
          top: startY + i,
        })
      );
    }
    return items;
  }

  /**
   * Add a track to the queue
   */
  addToQueue(item: QueueItem): void {
    this.queue.push(item);
    this.updateQueueDisplay();
  }

  /**
   * Remove first item from queue (after playing)
   */
  dequeue(): QueueItem | undefined {
    const item = this.queue.shift();
    this.updateQueueDisplay();
    return item;
  }

  /**
   * Get the current queue
   */
  getQueue(): QueueItem[] {
    return [...this.queue];
  }

  /**
   * Clear the queue
   */
  clearQueue(): void {
    this.queue = [];
    this.updateQueueDisplay();
  }

  /**
   * Check if queue has items
   */
  hasQueuedItems(): boolean {
    return this.queue.length > 0;
  }

  /**
   * Get next track from queue without removing
   */
  peekQueue(): QueueItem | undefined {
    return this.queue[0];
  }

  private updateQueueDisplay(): void {
    const maxWidth = this.layout.rightSidebarWidth - 4;

    for (let i = 0; i < this.queueItems.length; i++) {
      if (i < this.queue.length) {
        const item = this.queue[i];
        const num = `${i + 1}. `;
        let content = `${num}${item.title}`;
        
        // Truncate if needed
        if (content.length > maxWidth) {
          content = content.substring(0, maxWidth - 1) + "…";
        }

        (this.queueItems[i] as any).content = content;
        (this.queueItems[i] as any).fg = i === 0 ? colors.accent : colors.textSecondary;
      } else if (i === 0 && this.queue.length === 0) {
        (this.queueItems[i] as any).content = "(empty)";
        (this.queueItems[i] as any).fg = colors.textDim;
      } else {
        (this.queueItems[i] as any).content = "";
      }
    }
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
    this.renderer.root.add(this.queueTitle);
    this.queueItems.forEach(item => this.renderer.root.add(item));
    
    // Initial queue display
    this.updateQueueDisplay();
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    // Remove from renderer if needed
  }
}
