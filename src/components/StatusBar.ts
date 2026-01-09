import { BoxRenderable, TextRenderable } from "@opentui/core";
import { colors } from "../config/colors";
import type { CliRenderer, CurrentTrack, LayoutDimensions } from "../types";

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
		private track: CurrentTrack | null,
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
		const content = this.getStatusContent();

		return new TextRenderable(this.renderer, {
			id: "status-text",
			content,
			fg: colors.textSecondary,
			position: "absolute",
			left: 2,
			top: this.layout.contentHeight + 1,
		});
	}

	private getStatusContent(): string {
		if (!this.track) {
			return "⏹ No track playing - Select 'spotify-tui' device in Spotify";
		}
		const icon = this.track.isPlaying ? "▶" : "⏸";
		return `${icon} ${this.track.title} - ${this.track.artist || "Unknown"}`;
	}

	private createControls(): TextRenderable {
		const controlsText = "Space:⏯  n:⏭  p:⏮  +/-:Vol  q:Quit";

		return new TextRenderable(this.renderer, {
			id: "controls",
			content: controlsText,
			fg: colors.textDim,
			position: "absolute",
			left: this.layout.termWidth - controlsText.length - 2,
			top: this.layout.contentHeight + 1,
		});
	}

	/**
	 * Update status with new track info
	 */
	updateTrack(track: CurrentTrack | null): void {
		this.track = track;
		(this.statusText as any).content = this.getStatusContent();
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
