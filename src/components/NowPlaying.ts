import { BoxRenderable, TextRenderable } from "@opentui/core";
import { colors } from "../config/colors";
import { UI_STRINGS } from "../config/constants";
import type { CliRenderer, CurrentTrack, LayoutDimensions } from "../types";

/**
 * Now Playing component - full width bar at the bottom
 * Shows current track info centered, with progress bar and time
 */
export class NowPlaying {
	private container: BoxRenderable;
	private trackLine: TextRenderable;
	private progressLine: TextRenderable;

	private readonly progressBarWidth: number;

	constructor(
		private renderer: CliRenderer,
		private layout: LayoutDimensions,
		private track: CurrentTrack | null,
	) {
		// Progress bar width - leave room for time display on sides
		this.progressBarWidth = Math.max(
			20,
			Math.floor(this.layout.termWidth * 0.6),
		);

		this.container = this.createContainer();
		this.trackLine = this.createTrackLine();
		this.progressLine = this.createProgressLine();
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

	/**
	 * Create the main track info line (icon + title + artist)
	 * Centered horizontally
	 */
	private createTrackLine(): TextRenderable {
		const content = this.getTrackLineContent();
		const leftPos = Math.floor((this.layout.termWidth - content.length) / 2);

		return new TextRenderable(this.renderer, {
			id: "track-line",
			content,
			fg: colors.textPrimary,
			position: "absolute",
			left: Math.max(2, leftPos),
			top: this.layout.nowPlayingY + 1,
		});
	}

	/**
	 * Create the progress line (time + bar + time)
	 * Centered horizontally
	 */
	private createProgressLine(): TextRenderable {
		const content = this.getProgressLineContent();
		const leftPos = Math.floor((this.layout.termWidth - content.length) / 2);

		return new TextRenderable(this.renderer, {
			id: "progress-line",
			content,
			fg: colors.textSecondary,
			position: "absolute",
			left: Math.max(2, leftPos),
			top: this.layout.nowPlayingY + 3,
		});
	}

	/**
	 * Get the track info line content
	 */
	private getTrackLineContent(): string {
		if (!this.track) {
			return UI_STRINGS.noTrack;
		}

		const icon = this.track.isPlaying ? ">" : "||";
		const title = this.truncate(this.track.title, 40);
		const artist = this.track.artist || "Unknown";

		return `${icon}  ${title}  -  ${artist}`;
	}

	/**
	 * Get the progress line content (time + bar + time)
	 */
	private getProgressLineContent(): string {
		const currentTime = this.track?.currentTime || "0:00";
		const totalTime = this.track?.totalTime || "0:00";
		const progress = this.track?.progress || 0;

		const barWidth = this.progressBarWidth;
		const filled = Math.floor(barWidth * progress);
		const empty = barWidth - filled;
		const bar = `[${"=".repeat(filled)}${"-".repeat(empty)}]`;

		return `${currentTime}  ${bar}  ${totalTime}`;
	}

	private truncate(str: string, maxLength: number): string {
		if (str.length <= maxLength) return str;
		return `${str.substring(0, maxLength - 3)}...`;
	}

	/**
	 * Update the current track and refresh display
	 */
	updateTrack(track: CurrentTrack | null): void {
		this.track = track;

		// Update track line content and position
		const trackContent = this.getTrackLineContent();
		const trackLeftPos = Math.floor(
			(this.layout.termWidth - trackContent.length) / 2,
		);
		(this.trackLine as any).content = trackContent;
		(this.trackLine as any).left = Math.max(2, trackLeftPos);

		// Update progress line content and position
		const progressContent = this.getProgressLineContent();
		const progressLeftPos = Math.floor(
			(this.layout.termWidth - progressContent.length) / 2,
		);
		(this.progressLine as any).content = progressContent;
		(this.progressLine as any).left = Math.max(2, progressLeftPos);
	}

	/**
	 * Add all elements to renderer
	 */
	render(): void {
		this.renderer.root.add(this.container);
		this.renderer.root.add(this.trackLine);
		this.renderer.root.add(this.progressLine);
	}

	/**
	 * Update layout dimensions (for terminal resize)
	 */
	updateLayout(layout: LayoutDimensions): void {
		this.layout = layout;
		(this as any).progressBarWidth = Math.max(
			20,
			Math.floor(layout.termWidth * 0.6),
		);

		// Update container
		(this.container as any).width = layout.termWidth;
		(this.container as any).height = layout.nowPlayingHeight;
		(this.container as any).left = 0;
		(this.container as any).top = layout.nowPlayingY;

		// Update track and progress lines with new positions
		const trackContent = this.getTrackLineContent();
		const trackLeftPos = Math.floor(
			(layout.termWidth - trackContent.length) / 2,
		);
		(this.trackLine as any).left = Math.max(2, trackLeftPos);
		(this.trackLine as any).top = layout.nowPlayingY + 1;

		const progressContent = this.getProgressLineContent();
		const progressLeftPos = Math.floor(
			(layout.termWidth - progressContent.length) / 2,
		);
		(this.progressLine as any).left = Math.max(2, progressLeftPos);
		(this.progressLine as any).top = layout.nowPlayingY + 3;
	}

	/**
	 * Cleanup resources
	 */
	destroy(): void {
		// Remove from renderer if needed
	}
}
