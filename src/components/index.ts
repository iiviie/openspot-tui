export { CommandPalette } from "./CommandPalette";
export type { Command } from "./CommandPalette";
export { ContentWindow } from "./ContentWindow";
export { NowPlaying } from "./NowPlaying";
// Legacy exports (deprecated - will be removed)
export { Queue } from "./Queue";
export { SearchBar } from "./SearchBar";
export { Sidebar } from "./Sidebar";
export { StatusBar } from "./StatusBar";
export { StatusSidebar } from "./StatusSidebar";
export type {
	ConnectionStatus,
	MprisState,
	SpotifydState,
} from "./StatusSidebar";
export { Toast } from "./Toast";
export type { ToastConfig, ToastType } from "./Toast";
export {
	ToastManager,
	getToastManager,
	resetToastManager,
} from "./ToastManager";
// WelcomeSection merged into Sidebar
