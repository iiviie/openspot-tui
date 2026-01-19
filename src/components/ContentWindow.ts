import { BoxRenderable, TextRenderable } from "@opentui/core";
import { colors } from "../config/colors";
import type { CliRenderer, LayoutDimensions } from "../types";
import type { SpotifyPlaylist, SpotifyTrack } from "../types/spotify";
import { typedBox, typedText, TypedBox, TypedText } from "../ui";

/**
 * Content item types
 */
export interface ContentItem {
	id: string;
	uri: string;
	title: string;
	subtitle: string;
	duration?: string;
	type: "track" | "playlist" | "album" | "artist";
}

/**
 * Content view types
 */
export type ContentView = "playlists" | "tracks" | "search" | "playlist-tracks";

/**
 * Content window component - main center area below search bar
 * Displays playlists, search results, tracks, etc.
 */
export class ContentWindow {
	private container: BoxRenderable;
	private headerText: TextRenderable;
	private items: TextRenderable[] = [];
	private selectedIndex: number = 0;
	private scrollOffset: number = 0;
	private results: ContentItem[] = [];
	private statusMessage: string = "";
	private currentView: ContentView = "playlists";
	private isFocused: boolean = false;
	private isLoading: boolean = false;

	// Typed wrappers for type-safe updates
	private typedContainer: TypedBox;
	private typedHeaderText: TypedText;
	private typedItems: TypedText[] = [];

	// Callbacks
	public onTrackSelect: ((uri: string) => void) | null = null;
	public onPlaylistSelect:
		| ((playlistId: string, playlistName: string) => void)
		| null = null;

	constructor(
		private renderer: CliRenderer,
		private layout: LayoutDimensions,
	) {
		this.container = this.createContainer();
		this.headerText = this.createHeader();

		// Wrap renderables for type-safe updates
		this.typedContainer = typedBox(this.container);
		this.typedHeaderText = typedText(this.headerText);
	}

	private createContainer(): BoxRenderable {
		return new BoxRenderable(this.renderer, {
			id: "content-window",
			width: this.layout.centerWidth,
			height: this.layout.contentWindowHeight,
			backgroundColor: colors.bg,
			borderStyle: "single",
			borderColor: this.isFocused ? colors.accent : colors.border,
			position: "absolute",
			left: this.layout.centerX,
			top: this.layout.contentWindowY,
		});
	}

	private createHeader(): TextRenderable {
		return new TextRenderable(this.renderer, {
			id: "content-header",
			content: "",
			fg: colors.textDim,
			position: "absolute",
			left: this.layout.centerX + 2,
			top: this.layout.contentWindowY + 1,
		});
	}

	/**
	 * Set focus state (highlights border)
	 */
	setFocused(focused: boolean): void {
		this.isFocused = focused;
		this.typedContainer.update({
			borderColor: focused ? colors.accent : colors.border,
		});
	}

	/**
	 * Check if focused
	 */
	hasFocus(): boolean {
		return this.isFocused;
	}

	/**
	 * Show loading state
	 */
	setLoading(loading: boolean, message: string = "Loading..."): void {
		this.isLoading = loading;
		if (loading) {
			this.statusMessage = message;
			this.updateHeaderDisplay();
			this.clearItemsDisplay();
		}
	}

	/**
	 * Set a status message
	 */
	setStatus(message: string): void {
		this.statusMessage = message;
		this.updateHeaderDisplay();
	}

	/**
	 * Get current view type
	 */
	getCurrentView(): ContentView {
		return this.currentView;
	}

	/**
	 * Check if currently loading
	 */
	getIsLoading(): boolean {
		return this.isLoading;
	}

	/**
	 * Update with playlists
	 */
	updatePlaylists(playlists: SpotifyPlaylist[]): void {
		this.isLoading = false;
		this.selectedIndex = 0;
		this.scrollOffset = 0;
		this.currentView = "playlists";

		this.results = playlists.map((playlist) => ({
			id: playlist.id,
			uri: playlist.uri,
			title: playlist.name,
			subtitle: `${playlist.tracks.total} tracks`,
			type: "playlist" as const,
		}));

		if (this.results.length === 0) {
			this.statusMessage = "No playlists found";
		} else {
			this.statusMessage = `Your Playlists (${this.results.length})`;
		}

		this.updateHeaderDisplay();
		this.rebuildItems();
	}

	/**
	 * Update with tracks (search results or playlist tracks)
	 */
	updateTracks(tracks: SpotifyTrack[], title: string = "Tracks"): void {
		this.isLoading = false;
		this.selectedIndex = 0;
		this.scrollOffset = 0;
		this.currentView = "tracks";

		this.results = tracks.map((track) => ({
			id: track.id,
			uri: track.uri,
			title: track.name,
			subtitle: track.artists.map((a) => a.name).join(", "),
			duration: this.formatDuration(track.duration_ms),
			type: "track" as const,
		}));

		if (this.results.length === 0) {
			this.statusMessage = "No tracks found";
		} else {
			this.statusMessage = `${title} (${this.results.length})`;
		}

		this.updateHeaderDisplay();
		this.rebuildItems();
	}

	/**
	 * Update with search results
	 */
	updateSearchResults(tracks: SpotifyTrack[]): void {
		this.currentView = "search";
		this.updateTracks(tracks, "Search Results");
	}

	/**
	 * Update with playlist tracks
	 */
	updatePlaylistTracks(tracks: SpotifyTrack[], playlistName: string): void {
		this.currentView = "playlist-tracks";
		this.updateTracks(tracks, playlistName);
	}

	/**
	 * Clear all results
	 */
	clearResults(): void {
		this.results = [];
		this.selectedIndex = 0;
		this.scrollOffset = 0;
		this.statusMessage = "";
		this.updateHeaderDisplay();
		this.clearItemsDisplay();
	}

	private formatDuration(ms: number): string {
		const totalSeconds = Math.floor(ms / 1000);
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;
		return `${minutes}:${seconds.toString().padStart(2, "0")}`;
	}

	private updateHeaderDisplay(): void {
		this.typedHeaderText.update({ content: this.statusMessage });
	}

	private clearItemsDisplay(): void {
		this.typedItems.forEach((item) => {
			item.update({ content: "" });
		});
	}

	private rebuildItems(): void {
		const maxVisibleItems = this.layout.contentWindowHeight - 4;

		// Ensure we have enough TextRenderable items for the visible area
		while (this.items.length < maxVisibleItems) {
			const item = new TextRenderable(this.renderer, {
				id: `content-item-${this.items.length}`,
				content: "",
				fg: colors.textSecondary,
				position: "absolute",
				left: this.layout.centerX + 2,
				top: this.layout.contentWindowY + 3 + this.items.length,
			});
			this.items.push(item);
			this.typedItems.push(typedText(item));
			this.renderer.root.add(item);
		}

		// Update item contents based on scroll offset
		for (let i = 0; i < this.items.length; i++) {
			// Hide items that are beyond the visible area (important for resize)
			if (i >= maxVisibleItems) {
				this.typedItems[i].update({ content: "" });
				continue;
			}

			const resultIndex = this.scrollOffset + i;

			if (resultIndex < this.results.length) {
				const result = this.results[resultIndex];
				const isSelected = resultIndex === this.selectedIndex;
				const prefix = isSelected ? "> " : "  ";
				const maxWidth = this.layout.centerWidth - 6;

				// Format based on type
				let content: string;
				if (result.type === "playlist") {
					content = `${prefix}${result.title} (${result.subtitle})`;
					// Truncate if needed
					if (content.length > maxWidth) {
						content = `${content.substring(0, maxWidth - 3)}...`;
					}
				} else if (result.type === "track") {
					// Track formatting with aligned duration column
					const durationWidth = 6; // " 3:45 " format
					const availableWidth = maxWidth - durationWidth;
					const duration = result.duration || "";

					// Split available width: ~60% for title, ~40% for artist
					const titleWidth = Math.floor(availableWidth * 0.5);
					const artistWidth = availableWidth - titleWidth - 3; // -3 for " - "

					// Truncate title and artist
					let title = result.title;
					if (title.length > titleWidth) {
						title = `${title.substring(0, titleWidth - 1)}…`;
					}

					let artist = result.subtitle;
					if (artist.length > artistWidth) {
						artist = `${artist.substring(0, artistWidth - 1)}…`;
					}

					// Pad title to fixed width for alignment
					title = title.padEnd(titleWidth, " ");

					// Build content with aligned duration
					content =
						`${prefix}${title} - ${artist}`.padEnd(
							maxWidth - durationWidth,
							" ",
						) + duration.padStart(durationWidth, " ");
				} else {
					content = `${prefix}${result.title} - ${result.subtitle}`;
					// Truncate if needed
					if (content.length > maxWidth) {
						content = `${content.substring(0, maxWidth - 3)}...`;
					}
				}

				this.typedItems[i].update({
					content,
					fg: isSelected ? colors.textPrimary : colors.textSecondary,
				});
			} else {
				this.typedItems[i].update({ content: "" });
			}
		}
	}

	/**
	 * Move selection up
	 */
	selectPrevious(): void {
		if (this.results.length > 0) {
			this.selectedIndex = Math.max(0, this.selectedIndex - 1);

			// Adjust scroll offset if selection moved above visible area
			if (this.selectedIndex < this.scrollOffset) {
				this.scrollOffset = this.selectedIndex;
			}

			this.rebuildItems();
		}
	}

	/**
	 * Move selection down
	 */
	selectNext(): void {
		if (this.results.length > 0) {
			this.selectedIndex = Math.min(
				this.results.length - 1,
				this.selectedIndex + 1,
			);

			// Adjust scroll offset if selection moved below visible area
			const maxVisibleItems = this.layout.contentWindowHeight - 4;
			const maxVisibleIndex = this.scrollOffset + maxVisibleItems - 1;

			if (this.selectedIndex > maxVisibleIndex) {
				this.scrollOffset = this.selectedIndex - maxVisibleItems + 1;
			}

			this.rebuildItems();
		}
	}

	/**
	 * Get currently selected item
	 */
	getSelectedItem(): ContentItem | null {
		if (this.results.length === 0) return null;
		return this.results[this.selectedIndex];
	}

	/**
	 * Select current item (trigger appropriate action)
	 */
	selectCurrent(): void {
		const selected = this.getSelectedItem();
		if (!selected) return;

		if (selected.type === "playlist" && this.onPlaylistSelect) {
			this.onPlaylistSelect(selected.id, selected.title);
		} else if (selected.type === "track" && this.onTrackSelect) {
			this.onTrackSelect(selected.uri);
		}
	}

	/**
	 * Check if there are results to navigate
	 */
	hasResults(): boolean {
		return this.results.length > 0;
	}

	/**
	 * Add all elements to renderer
	 */
	render(): void {
		this.renderer.root.add(this.container);
		this.renderer.root.add(this.headerText);
	}

	/**
	 * Update layout dimensions (for terminal resize)
	 */
	updateLayout(layout: LayoutDimensions): void {
		this.layout = layout;

		// Update container
		this.typedContainer.update({
			width: layout.centerWidth,
			height: layout.contentWindowHeight,
			left: layout.centerX,
			top: layout.contentWindowY,
		});

		// Update header
		this.typedHeaderText.update({
			left: layout.centerX + 2,
			top: layout.contentWindowY + 1,
		});

		// Update existing items positions
		this.items.forEach((item, index) => {
			this.typedItems[index].update({
				left: layout.centerX + 2,
				top: layout.contentWindowY + 3 + index,
			});
		});

		// Rebuild items to handle new visible area size
		this.rebuildItems();
	}

	/**
	 * Cleanup resources
	 */
	destroy(): void {
		// Remove from renderer if needed
	}
}
