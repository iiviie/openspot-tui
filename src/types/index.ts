import type { BoxRenderable, CliRenderer, TextRenderable } from "@opentui/core";

/**
 * Track information
 */
export interface Track {
	title: string;
	artist?: string;
	album?: string;
	uri?: string;
}

/**
 * Currently playing track with playback info
 */
export interface CurrentTrack extends Track {
	currentTime: string;
	totalTime: string;
	progress: number; // 0-1
	isPlaying: boolean;
	artUrl?: string;
}

/**
 * Menu item for navigation
 */
export interface MenuItem {
	id: string;
	label: string;
	icon?: string;
	action?: () => void | Promise<void>;
}

/**
 * Focus panel type
 */
export type FocusPanel = "sidebar" | "content" | "queue";

/**
 * Application state
 */
export interface AppState {
	selectedMenuIndex: number;
	currentTrack: CurrentTrack | null;
	queue: Track[];
	isPlaying: boolean;
	// Extended state for managers
	position: number;
	duration: number;
	volume: number;
	shuffle: boolean;
	repeat: "None" | "Playlist" | "Track";
	tracks: Track[];
	selectedTrackIndex: number;
	focus: FocusPanel;
	sidebarItems: MenuItem[];
	selectedSidebarIndex: number;
}

/**
 * Layout dimensions for UI components
 * ASCII diagram of layout:
 * +----------+---------------------------+----------+
 * |          |       SEARCH BAR          |          |
 * |          +---------------------------+          |
 * |  LIBRARY |                           |  STATUS  |
 * |          |     CONTENT WINDOW        |          |
 * |          |                           |          |
 * +----------+---------------------------+----------+
 * |              NOW PLAYING                        |
 * +-------------------------------------------------+
 */
export interface LayoutDimensions {
	termWidth: number;
	termHeight: number;
	// Left sidebar (Library with welcome section inside)
	leftSidebarWidth: number;
	leftSidebarHeight: number;
	leftSidebarX: number;
	leftSidebarY: number;
	// Right sidebar (Status)
	rightSidebarWidth: number;
	rightSidebarHeight: number;
	rightSidebarX: number;
	rightSidebarY: number;
	// Center content area
	centerWidth: number;
	centerX: number;
	// Search bar (top of center)
	searchBarHeight: number;
	searchBarY: number;
	// Content window (main center area)
	contentWindowHeight: number;
	contentWindowY: number;
	// Now playing bar (bottom full width)
	nowPlayingHeight: number;
	nowPlayingY: number;
	// Legacy (for compatibility)
	sidebarWidth: number;
	mainWidth: number;
	contentHeight: number;
	statusBarHeight: number;
}

/**
 * Color scheme definition
 */
export interface ColorScheme {
	bg: string;
	bgSecondary: string;
	border: string;
	textPrimary: string;
	textSecondary: string;
	textDim: string;
	accent: string;
	highlight: string;
	success: string;
	warning: string;
	error: string;
}

/**
 * Keyboard event from renderer
 */
export interface KeyEvent {
	name: string;
	ctrl: boolean;
	shift: boolean;
	meta: boolean;
}

/**
 * Component render context
 */
export interface RenderContext {
	renderer: CliRenderer;
	layout: LayoutDimensions;
}

/**
 * Base component interface
 */
export interface Component {
	render(context: RenderContext): void;
	destroy(): void;
}

/**
 * Re-export OpenTUI types for convenience
 */
export type { CliRenderer, TextRenderable, BoxRenderable };

/**
 * Re-export MPRIS types
 */
export * from "./mpris";
/**
 * Re-export Spotify types
 */
export * from "./spotify";
