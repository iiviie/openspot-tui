import { BoxRenderable, TextRenderable } from "@opentui/core";
import { colors } from "../config/colors";
import type { CliRenderer, CurrentTrack, LayoutDimensions } from "../types";

/**
 * Queue item interface
 */
export interface QueueItem {
	uri: string;
	title: string;
	artist: string;
}

/**
 * Connection status for display
 */
export interface ConnectionStatus {
	spotifydInstalled: boolean;
	spotifydRunning: boolean;
	spotifydAuthenticated: boolean;
	mprisConnected: boolean;
	mprisBackend?: "native" | "typescript"; // Which MPRIS implementation is being used
	lastAction?: string; // Last action performed (for feedback)
	lastActionTime?: number; // Timestamp of last action
}

/**
 * Status sidebar component (right side)
 * Shows playback status, volume, shuffle/repeat state, connection status, and queue
 */
export class StatusSidebar {
	private container: BoxRenderable;
	private title: TextRenderable;
	private playbackStatus: TextRenderable;
	private volumeLabel: TextRenderable;
	private shuffleLabel: TextRenderable;
	private repeatLabel: TextRenderable;
	private connectionTitle: TextRenderable;
	private spotifydStatusLabel: TextRenderable;
	private mprisStatusLabel: TextRenderable;
	private backendLabel: TextRenderable;
	private activityLabel: TextRenderable;
	private queueTitle: TextRenderable;
	private queueItems: TextRenderable[] = [];
	private queue: QueueItem[] = [];
	private connectionStatus: ConnectionStatus = {
		spotifydInstalled: false,
		spotifydRunning: false,
		spotifydAuthenticated: false,
		mprisConnected: false,
		mprisBackend: "native",
	};

	constructor(
		private renderer: CliRenderer,
		private layout: LayoutDimensions,
		private track: CurrentTrack | null = null,
		private volume: number = 100,
		private shuffle: boolean = false,
		private repeat: string = "None",
	) {
		this.container = this.createContainer();
		this.title = this.createTitle();
		this.playbackStatus = this.createPlaybackStatus();
		this.volumeLabel = this.createVolumeLabel();
		this.shuffleLabel = this.createShuffleLabel();
		this.repeatLabel = this.createRepeatLabel();
		this.connectionTitle = this.createConnectionTitle();
		this.spotifydStatusLabel = this.createSpotifydStatusLabel();
		this.mprisStatusLabel = this.createMprisStatusLabel();
		this.backendLabel = this.createBackendLabel();
		this.activityLabel = this.createActivityLabel();
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

	private createConnectionTitle(): TextRenderable {
		return new TextRenderable(this.renderer, {
			id: "connection-title",
			content: "CONNECTION",
			fg: colors.textDim,
			position: "absolute",
			left: this.layout.rightSidebarX + 2,
			top: this.layout.rightSidebarY + 9,
		});
	}

	private createSpotifydStatusLabel(): TextRenderable {
		return new TextRenderable(this.renderer, {
			id: "spotifyd-status",
			content: this.getSpotifydStatusText(),
			fg: this.getSpotifydStatusColor(),
			position: "absolute",
			left: this.layout.rightSidebarX + 2,
			top: this.layout.rightSidebarY + 11,
		});
	}

	private createMprisStatusLabel(): TextRenderable {
		return new TextRenderable(this.renderer, {
			id: "mpris-status",
			content: this.getMprisStatusText(),
			fg: this.getMprisStatusColor(),
			position: "absolute",
			left: this.layout.rightSidebarX + 2,
			top: this.layout.rightSidebarY + 12,
		});
	}

	private getSpotifydStatusText(): string {
		if (!this.connectionStatus.spotifydInstalled) {
			return "spotifyd: Not installed";
		}
		if (!this.connectionStatus.spotifydAuthenticated) {
			return "spotifyd: Not authenticated";
		}
		if (!this.connectionStatus.spotifydRunning) {
			return "spotifyd: Stopped";
		}
		return "spotifyd: Running";
	}

	private getSpotifydStatusColor(): string {
		if (!this.connectionStatus.spotifydInstalled) {
			return colors.error;
		}
		if (!this.connectionStatus.spotifydAuthenticated) {
			return colors.warning;
		}
		if (!this.connectionStatus.spotifydRunning) {
			return colors.textDim;
		}
		return colors.success;
	}

	private getMprisStatusText(): string {
		return this.connectionStatus.mprisConnected
			? "MPRIS: Connected"
			: "MPRIS: Disconnected";
	}

	private getMprisStatusColor(): string {
		return this.connectionStatus.mprisConnected
			? colors.success
			: colors.textDim;
	}

	private createBackendLabel(): TextRenderable {
		return new TextRenderable(this.renderer, {
			id: "backend-label",
			content: this.getBackendText(),
			fg: colors.textDim,
			position: "absolute",
			left: this.layout.rightSidebarX + 2,
			top: this.layout.rightSidebarY + 13,
		});
	}

	private getBackendText(): string {
		const backend = this.connectionStatus.mprisBackend || "native";
		return backend === "native" ? "Backend: Rust" : "Backend: TS";
	}

	private createActivityLabel(): TextRenderable {
		return new TextRenderable(this.renderer, {
			id: "activity-label",
			content: "",
			fg: colors.accent,
			position: "absolute",
			left: this.layout.rightSidebarX + 2,
			top: this.layout.rightSidebarY + 14,
		});
	}

	private getActivityText(): string {
		const lastAction = this.connectionStatus.lastAction;
		const lastTime = this.connectionStatus.lastActionTime;

		if (!lastAction || !lastTime) return "";

		// Only show activity for 3 seconds
		const elapsed = Date.now() - lastTime;
		if (elapsed > 3000) return "";

		return lastAction;
	}

	private createQueueTitle(): TextRenderable {
		return new TextRenderable(this.renderer, {
			id: "queue-title",
			content: "QUEUE",
			fg: colors.textDim,
			position: "absolute",
			left: this.layout.rightSidebarX + 2,
			top: this.layout.rightSidebarY + 16,
		});
	}

	private createQueueItems(): TextRenderable[] {
		// Calculate how many queue items can fit
		const startY = this.layout.rightSidebarY + 18;
		const availableHeight = this.layout.rightSidebarHeight - 20;
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
				}),
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
					content = `${content.substring(0, maxWidth - 1)}…`;
				}

				(this.queueItems[i] as any).content = content;
				(this.queueItems[i] as any).fg =
					i === 0 ? colors.accent : colors.textSecondary;
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
		repeat?: string,
	): void {
		this.track = track;
		if (volume !== undefined) this.volume = volume;
		if (shuffle !== undefined) this.shuffle = shuffle;
		if (repeat !== undefined) this.repeat = repeat;

		// Update playback status
		const playIcon = this.track?.isPlaying ? "Playing" : "Paused";
		(this.playbackStatus as any).content = playIcon;
		(this.playbackStatus as any).fg = this.track?.isPlaying
			? colors.accent
			: colors.textSecondary;

		// Update volume
		(this.volumeLabel as any).content = `Vol: ${this.volume}%`;

		// Update shuffle
		(this.shuffleLabel as any).content =
			`Shuffle: ${this.shuffle ? "On" : "Off"}`;
		(this.shuffleLabel as any).fg = this.shuffle
			? colors.accent
			: colors.textDim;

		// Update repeat
		(this.repeatLabel as any).content = `Repeat: ${this.repeat}`;
		(this.repeatLabel as any).fg =
			this.repeat !== "None" ? colors.accent : colors.textDim;
	}

	/**
	 * Update connection status indicators
	 */
	updateConnectionStatus(status: ConnectionStatus): void {
		this.connectionStatus = status;

		// Update spotifyd status
		(this.spotifydStatusLabel as any).content = this.getSpotifydStatusText();
		(this.spotifydStatusLabel as any).fg = this.getSpotifydStatusColor();

		// Update MPRIS status
		(this.mprisStatusLabel as any).content = this.getMprisStatusText();
		(this.mprisStatusLabel as any).fg = this.getMprisStatusColor();

		// Update backend label
		(this.backendLabel as any).content = this.getBackendText();

		// Update activity label
		const activityText = this.getActivityText();
		(this.activityLabel as any).content = activityText;
		(this.activityLabel as any).fg = activityText
			? colors.accent
			: colors.textDim;
	}

	/**
	 * Set the last action for activity feedback
	 */
	setLastAction(action: string): void {
		this.connectionStatus.lastAction = action;
		this.connectionStatus.lastActionTime = Date.now();
		(this.activityLabel as any).content = action;
		(this.activityLabel as any).fg = colors.accent;
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
		this.renderer.root.add(this.connectionTitle);
		this.renderer.root.add(this.spotifydStatusLabel);
		this.renderer.root.add(this.mprisStatusLabel);
		this.renderer.root.add(this.backendLabel);
		this.renderer.root.add(this.activityLabel);
		this.renderer.root.add(this.queueTitle);
		for (const item of this.queueItems) {
			this.renderer.root.add(item);
		}

		// Initial queue display
		this.updateQueueDisplay();
	}

	/**
	 * Update layout dimensions (for terminal resize)
	 */
	updateLayout(layout: LayoutDimensions): void {
		this.layout = layout;

		// Update container
		(this.container as any).width = layout.rightSidebarWidth;
		(this.container as any).height = layout.rightSidebarHeight;
		(this.container as any).left = layout.rightSidebarX;
		(this.container as any).top = layout.rightSidebarY;

		// Update title
		(this.title as any).left = layout.rightSidebarX + 2;
		(this.title as any).top = layout.rightSidebarY + 1;

		// Update playback status
		(this.playbackStatus as any).left = layout.rightSidebarX + 2;
		(this.playbackStatus as any).top = layout.rightSidebarY + 3;

		// Update volume label
		(this.volumeLabel as any).left = layout.rightSidebarX + 2;
		(this.volumeLabel as any).top = layout.rightSidebarY + 5;

		// Update shuffle label
		(this.shuffleLabel as any).left = layout.rightSidebarX + 2;
		(this.shuffleLabel as any).top = layout.rightSidebarY + 6;

		// Update repeat label
		(this.repeatLabel as any).left = layout.rightSidebarX + 2;
		(this.repeatLabel as any).top = layout.rightSidebarY + 7;

		// Update connection section
		(this.connectionTitle as any).left = layout.rightSidebarX + 2;
		(this.connectionTitle as any).top = layout.rightSidebarY + 9;

		(this.spotifydStatusLabel as any).left = layout.rightSidebarX + 2;
		(this.spotifydStatusLabel as any).top = layout.rightSidebarY + 11;

		(this.mprisStatusLabel as any).left = layout.rightSidebarX + 2;
		(this.mprisStatusLabel as any).top = layout.rightSidebarY + 12;

		// Update backend label
		(this.backendLabel as any).left = layout.rightSidebarX + 2;
		(this.backendLabel as any).top = layout.rightSidebarY + 13;

		// Update activity label
		(this.activityLabel as any).left = layout.rightSidebarX + 2;
		(this.activityLabel as any).top = layout.rightSidebarY + 14;

		// Update queue title
		(this.queueTitle as any).left = layout.rightSidebarX + 2;
		(this.queueTitle as any).top = layout.rightSidebarY + 16;

		// Update queue items
		const startY = layout.rightSidebarY + 18;
		this.queueItems.forEach((item, index) => {
			(item as any).left = layout.rightSidebarX + 2;
			(item as any).top = startY + index;
		});

		// Refresh queue display with new dimensions
		this.updateQueueDisplay();
	}

	/**
	 * Cleanup resources
	 */
	destroy(): void {
		// Remove from renderer if needed
	}
}
