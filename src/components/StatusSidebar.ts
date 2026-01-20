import { BoxRenderable, TextRenderable } from "@opentui/core";
import { colors } from "../config/colors";
import type { CliRenderer, CurrentTrack, LayoutDimensions } from "../types";
import { typedBox, typedText, TypedBox, TypedText } from "../ui";

/**
 * Granular spotifyd daemon states
 */
export type SpotifydState =
	| "not_installed"
	| "not_authenticated"
	| "stopped"
	| "starting"
	| "running"
	| "stopping"
	| "authenticating"
	| "error";

/**
 * Granular MPRIS connection states
 */
export type MprisState =
	| "disconnected"
	| "connecting"
	| "connected"
	| "reconnecting"
	| "error";

/**
 * Connection status for display
 */
export interface ConnectionStatus {
	spotifydInstalled: boolean;
	spotifydRunning: boolean;
	spotifydAuthenticated: boolean;
	spotifydState?: SpotifydState; // Granular state
	spotifydError?: string; // Error message if state is "error"
	mprisConnected: boolean;
	mprisState?: MprisState; // Granular state
	mprisBackend?: "native" | "typescript"; // Which MPRIS implementation is being used
	webApiLoggedIn?: boolean; // Web API authentication status
	username?: string; // Logged in username
	lastAction?: string; // Last action performed (for feedback)
	lastActionTime?: number; // Timestamp of last action
}

/**
 * Status sidebar component (right side)
 * Shows playback status, volume, shuffle/repeat state, and connection status
 * Note: Queue has been moved to the left Sidebar component
 *
 * Type-safe: Uses TypedBox/TypedText wrappers (no 'as any')
 */
export class StatusSidebar {
	// Raw renderables
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

	// Typed wrappers (eliminates 'as any')
	private typedContainer: TypedBox;
	private typedTitle: TypedText;
	private typedPlaybackStatus: TypedText;
	private typedVolumeLabel: TypedText;
	private typedShuffleLabel: TypedText;
	private typedRepeatLabel: TypedText;
	private typedConnectionTitle: TypedText;
	private typedSpotifydStatusLabel: TypedText;
	private typedMprisStatusLabel: TypedText;
	private typedBackendLabel: TypedText;
	private typedActivityLabel: TypedText;

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
		// Create renderables
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

		// Wrap with type-safe wrappers
		this.typedContainer = typedBox(this.container);
		this.typedTitle = typedText(this.title);
		this.typedPlaybackStatus = typedText(this.playbackStatus);
		this.typedVolumeLabel = typedText(this.volumeLabel);
		this.typedShuffleLabel = typedText(this.shuffleLabel);
		this.typedRepeatLabel = typedText(this.repeatLabel);
		this.typedConnectionTitle = typedText(this.connectionTitle);
		this.typedSpotifydStatusLabel = typedText(this.spotifydStatusLabel);
		this.typedMprisStatusLabel = typedText(this.mprisStatusLabel);
		this.typedBackendLabel = typedText(this.backendLabel);
		this.typedActivityLabel = typedText(this.activityLabel);
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
		// Use granular state if available
		if (this.connectionStatus.spotifydState) {
			switch (this.connectionStatus.spotifydState) {
				case "not_installed":
					return "spotifyd: Not installed";
				case "not_authenticated":
					return "spotifyd: Not authenticated";
				case "stopped":
					return "spotifyd: Stopped";
				case "starting":
					return "spotifyd: Starting...";
				case "running":
					return "spotifyd: Running";
				case "stopping":
					return "spotifyd: Stopping...";
				case "authenticating":
					return "spotifyd: Authenticating...";
				case "error":
					return `spotifyd: Error${this.connectionStatus.spotifydError ? ` - ${this.connectionStatus.spotifydError}` : ""}`;
			}
		}

		// Fallback to legacy logic
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
		// Use granular state if available
		if (this.connectionStatus.spotifydState) {
			switch (this.connectionStatus.spotifydState) {
				case "not_installed":
				case "error":
					return colors.error;
				case "not_authenticated":
					return colors.warning;
				case "stopped":
					return colors.textDim;
				case "starting":
				case "stopping":
				case "authenticating":
					return colors.accent; // Use accent for transient states
				case "running":
					return colors.success;
			}
		}

		// Fallback to legacy logic
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
		// Use granular state if available
		if (this.connectionStatus.mprisState) {
			switch (this.connectionStatus.mprisState) {
				case "disconnected":
					return "MPRIS: Disconnected";
				case "connecting":
					return "MPRIS: Connecting...";
				case "connected":
					return "MPRIS: Connected";
				case "reconnecting":
					return "MPRIS: Reconnecting...";
				case "error":
					return "MPRIS: Error";
			}
		}

		// Fallback to legacy logic
		return this.connectionStatus.mprisConnected
			? "MPRIS: Connected"
			: "MPRIS: Disconnected";
	}

	private getMprisStatusColor(): string {
		// Use granular state if available
		if (this.connectionStatus.mprisState) {
			switch (this.connectionStatus.mprisState) {
				case "disconnected":
					return colors.textDim;
				case "connecting":
				case "reconnecting":
					return colors.accent; // Use accent for transient states
				case "connected":
					return colors.success;
				case "error":
					return colors.error;
			}
		}

		// Fallback to legacy logic
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

		// Type-safe updates (no 'as any')
		const playIcon = this.track?.isPlaying ? "Playing" : "Paused";
		this.typedPlaybackStatus.update({
			content: playIcon,
			fg: this.track?.isPlaying ? colors.accent : colors.textSecondary,
		});

		this.typedVolumeLabel.update({ content: `Vol: ${this.volume}%` });

		this.typedShuffleLabel.update({
			content: `Shuffle: ${this.shuffle ? "On" : "Off"}`,
			fg: this.shuffle ? colors.accent : colors.textDim,
		});

		this.typedRepeatLabel.update({
			content: `Repeat: ${this.repeat}`,
			fg: this.repeat !== "None" ? colors.accent : colors.textDim,
		});
	}

	/**
	 * Update connection status indicators
	 */
	updateConnectionStatus(status: ConnectionStatus): void {
		this.connectionStatus = status;

		// Type-safe updates (no 'as any')
		this.typedSpotifydStatusLabel.update({
			content: this.getSpotifydStatusText(),
			fg: this.getSpotifydStatusColor(),
		});

		this.typedMprisStatusLabel.update({
			content: this.getMprisStatusText(),
			fg: this.getMprisStatusColor(),
		});

		this.typedBackendLabel.update({ content: this.getBackendText() });

		const activityText = this.getActivityText();
		this.typedActivityLabel.update({
			content: activityText,
			fg: activityText ? colors.accent : colors.textDim,
		});
	}

	/**
	 * Set the last action for activity feedback
	 */
	setLastAction(action: string): void {
		this.connectionStatus.lastAction = action;
		this.connectionStatus.lastActionTime = Date.now();
		this.typedActivityLabel.update({
			content: action,
			fg: colors.accent,
		});
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
	}

	/**
	 * Update layout dimensions (for terminal resize)
	 */
	updateLayout(layout: LayoutDimensions): void {
		this.layout = layout;

		// Type-safe updates (no 'as any')
		this.typedContainer.update({
			width: layout.rightSidebarWidth,
			height: layout.rightSidebarHeight,
			left: layout.rightSidebarX,
			top: layout.rightSidebarY,
		});

		this.typedTitle.update({
			left: layout.rightSidebarX + 2,
			top: layout.rightSidebarY + 1,
		});

		this.typedPlaybackStatus.update({
			left: layout.rightSidebarX + 2,
			top: layout.rightSidebarY + 3,
		});

		this.typedVolumeLabel.update({
			left: layout.rightSidebarX + 2,
			top: layout.rightSidebarY + 5,
		});

		this.typedShuffleLabel.update({
			left: layout.rightSidebarX + 2,
			top: layout.rightSidebarY + 6,
		});

		this.typedRepeatLabel.update({
			left: layout.rightSidebarX + 2,
			top: layout.rightSidebarY + 7,
		});

		this.typedConnectionTitle.update({
			left: layout.rightSidebarX + 2,
			top: layout.rightSidebarY + 9,
		});

		this.typedSpotifydStatusLabel.update({
			left: layout.rightSidebarX + 2,
			top: layout.rightSidebarY + 11,
		});

		this.typedMprisStatusLabel.update({
			left: layout.rightSidebarX + 2,
			top: layout.rightSidebarY + 12,
		});

		this.typedBackendLabel.update({
			left: layout.rightSidebarX + 2,
			top: layout.rightSidebarY + 13,
		});

		this.typedActivityLabel.update({
			left: layout.rightSidebarX + 2,
			top: layout.rightSidebarY + 14,
		});
	}

	/**
	 * Cleanup resources
	 */
	destroy(): void {
		// Remove from renderer if needed
	}
}
