import { 
  createCliRenderer, 
  BoxRenderable, 
  TextRenderable,
  ConsolePosition
} from "@opentui/core";
import { spawnSync } from "child_process";

// Cleanup function to restore terminal state
function cleanupTerminal() {
  // Disable all mouse tracking modes
  process.stdout.write("\x1b[?1000l"); // Disable mouse click tracking
  process.stdout.write("\x1b[?1002l"); // Disable mouse button tracking
  process.stdout.write("\x1b[?1003l"); // Disable all mouse tracking
  process.stdout.write("\x1b[?1006l"); // Disable SGR mouse mode
  process.stdout.write("\x1b[?1015l"); // Disable urxvt mouse mode
  // Show cursor
  process.stdout.write("\x1b[?25h");
  // Exit alternate screen buffer
  process.stdout.write("\x1b[?1049l");
  // Clear screen and reset cursor position
  process.stdout.write("\x1b[2J\x1b[H");
  // Reset all attributes
  process.stdout.write("\x1b[0m");
  
  // Use stty sane to fully reset terminal state
  try {
    spawnSync("stty", ["sane"], { stdio: "inherit" });
  } catch {
    // Ignore if stty fails
  }
}

// Zinc/Gray color scheme
const colors = {
  bg: "#18181b",           // zinc-900
  bgSecondary: "#27272a",  // zinc-800
  border: "#3f3f46",       // zinc-700
  textPrimary: "#fafafa",  // zinc-50
  textSecondary: "#a1a1aa", // zinc-400
  textDim: "#71717a",      // zinc-500
  accent: "#52525b",       // zinc-600
  highlight: "#d4d4d8",    // zinc-300
};

// Mock data
const currentTrack = {
  title: "Starlight",
  artist: "Tycho",
  album: "Epoch",
  currentTime: "2:34",
  totalTime: "4:15",
  progress: 0.56,
};

const libraryItems = ["Artists", "Albums", "Songs", "Playlists"];

const queue = [
  { title: "Starlight", artist: "Tycho" },
  { title: "Your Hath Chess", album: "Epoch" },
  { title: "Line On Uw", album: "Epoch" },
  { title: "Starlight", artist: "Tycho" },
  { title: "Sunmerrcy", artist: "Tycho" },
  { title: "Tanona Maving Point", album: "Tycho" },
  { title: "Feels of Switch", artist: "Tycho" },
  { title: "Utoto a Tycho", artist: "Tycho" },
  { title: "The Starlight", artist: "Tycho" },
];

async function main() {
  const renderer = await createCliRenderer({
    consoleOptions: {
      position: ConsolePosition.BOTTOM,
      sizePercent: 20,
      startInDebugMode: false,
    },
  });

  // Get terminal dimensions
  const termWidth = process.stdout.columns || 120;
  const termHeight = process.stdout.rows || 30;
  
  // Layout calculations
  const sidebarWidth = 22;
  const mainWidth = termWidth - sidebarWidth;
  const contentHeight = termHeight - 3; // Leave room for status bar
  const statusBarHeight = 3;

  // Track selected menu item
  let selectedIndex = 0;
  const menuItems: TextRenderable[] = [];

  // ============ LEFT SIDEBAR ============
  
  const sidebar = new BoxRenderable(renderer, {
    id: "sidebar",
    width: sidebarWidth,
    height: contentHeight,
    backgroundColor: colors.bg,
    borderStyle: "single",
    borderColor: colors.border,
    position: "absolute",
    left: 0,
    top: 0,
  });

  const libraryTitle = new TextRenderable(renderer, {
    id: "library-title",
    content: "LIBRARY",
    fg: colors.textDim,
    position: "absolute",
    left: 2,
    top: 1,
  });

  // Create static menu items
  libraryItems.forEach((item, index) => {
    const isSelected = index === selectedIndex;
    const menuItem = new TextRenderable(renderer, {
      id: `menu-${index}`,
      content: `${isSelected ? ">" : " "} ${item}`,
      fg: isSelected ? colors.textPrimary : colors.textSecondary,
      position: "absolute",
      left: 2,
      top: 3 + index,
    });
    menuItems.push(menuItem);
  });

  // ============ MAIN CONTENT ============
  
  const mainBox = new BoxRenderable(renderer, {
    id: "main-box",
    width: mainWidth,
    height: contentHeight,
    backgroundColor: colors.bg,
    borderStyle: "single",
    borderColor: colors.border,
    position: "absolute",
    left: sidebarWidth,
    top: 0,
  });

  const mainContentLeft = sidebarWidth + 2;

  const nowPlayingLabel = new TextRenderable(renderer, {
    id: "now-playing-label",
    content: "NOW PLAYING",
    fg: colors.textDim,
    position: "absolute",
    left: mainContentLeft,
    top: 1,
  });

  const trackTitle = new TextRenderable(renderer, {
    id: "track-title",
    content: `Track: ${currentTrack.title}`,
    fg: colors.textPrimary,
    position: "absolute",
    left: mainContentLeft,
    top: 3,
  });

  const trackArtist = new TextRenderable(renderer, {
    id: "track-artist",
    content: `Artist: ${currentTrack.artist} | Album: ${currentTrack.album}`,
    fg: colors.textSecondary,
    position: "absolute",
    left: mainContentLeft,
    top: 4,
  });

  // Progress bar - scale to available width
  const barWidth = Math.max(20, mainWidth - 20);
  const filled = Math.floor(barWidth * currentTrack.progress);
  const progressBar = new TextRenderable(renderer, {
    id: "progress-bar",
    content: `[${"=".repeat(filled)}${"-".repeat(barWidth - filled)}]`,
    fg: colors.textSecondary,
    position: "absolute",
    left: mainContentLeft,
    top: 6,
  });

  const timeDisplay = new TextRenderable(renderer, {
    id: "time-display",
    content: `${currentTrack.currentTime} / ${currentTrack.totalTime}`,
    fg: colors.textDim,
    position: "absolute",
    left: mainContentLeft + barWidth + 3,
    top: 6,
  });

  // ============ QUEUE ============
  
  const queueLabel = new TextRenderable(renderer, {
    id: "queue-label",
    content: "QUEUE",
    fg: colors.textDim,
    position: "absolute",
    left: mainContentLeft,
    top: 8,
  });

  const queueItems: TextRenderable[] = [];
  const maxQueueItems = Math.min(queue.length, contentHeight - 12);
  
  queue.slice(0, maxQueueItems).forEach((track, index) => {
    const text = track.artist 
      ? `${track.title} - ${track.artist}`
      : `${track.title} | Album: ${track.album}`;
    
    const queueItem = new TextRenderable(renderer, {
      id: `queue-${index}`,
      content: text,
      fg: index === 0 ? colors.highlight : colors.textSecondary,
      position: "absolute",
      left: mainContentLeft,
      top: 10 + index,
    });
    queueItems.push(queueItem);
  });

  // ============ STATUS BAR ============
  
  const statusBar = new BoxRenderable(renderer, {
    id: "status-bar",
    width: termWidth,
    height: statusBarHeight,
    backgroundColor: colors.bgSecondary,
    borderStyle: "single",
    borderColor: colors.border,
    position: "absolute",
    left: 0,
    top: contentHeight,
  });

  const statusText = new TextRenderable(renderer, {
    id: "status-text",
    content: `Playing: ${currentTrack.title} - ${currentTrack.artist}`,
    fg: colors.textSecondary,
    position: "absolute",
    left: 2,
    top: contentHeight + 1,
  });

  const controls = new TextRenderable(renderer, {
    id: "controls",
    content: "[<] [>] [||]  q:quit",
    fg: colors.textDim,
    position: "absolute",
    left: termWidth - 22,
    top: contentHeight + 1,
  });

  // ============ ADD COMPONENTS ============
  
  renderer.root.add(sidebar);
  renderer.root.add(libraryTitle);
  menuItems.forEach(item => renderer.root.add(item));
  renderer.root.add(mainBox);
  renderer.root.add(nowPlayingLabel);
  renderer.root.add(trackTitle);
  renderer.root.add(trackArtist);
  renderer.root.add(progressBar);
  renderer.root.add(timeDisplay);
  renderer.root.add(queueLabel);
  queueItems.forEach(item => renderer.root.add(item));
  renderer.root.add(statusBar);
  renderer.root.add(statusText);
  renderer.root.add(controls);

  // Update menu selection display
  function updateMenu() {
    menuItems.forEach((item, index) => {
      const isSelected = index === selectedIndex;
      (item as any).setContent(`${isSelected ? ">" : " "} ${libraryItems[index]}`);
      (item as any).setFg(isSelected ? colors.textPrimary : colors.textSecondary);
    });
  }

  // Graceful exit function
  function exitApp() {
    // Try to stop the renderer if it has a stop method
    try {
      if (typeof (renderer as any).stop === "function") {
        (renderer as any).stop();
      }
      if (typeof (renderer as any).destroy === "function") {
        (renderer as any).destroy();
      }
    } catch {
      // Ignore errors
    }
    cleanupTerminal();
    process.exit(0);
  }

  // Handle keyboard input
  (renderer.keyInput as any).on("keypress", (key: { ctrl: boolean; name: string }) => {
    if (key.ctrl && key.name === "c") {
      exitApp();
    }
    if (key.name === "q") {
      exitApp();
    }
    if (key.name === "up" || key.name === "k") {
      selectedIndex = Math.max(0, selectedIndex - 1);
      updateMenu();
    }
    if (key.name === "down" || key.name === "j") {
      selectedIndex = Math.min(libraryItems.length - 1, selectedIndex + 1);
      updateMenu();
    }
    if (key.name === "return") {
      console.log(`Selected: ${libraryItems[selectedIndex]}`);
    }
  });

  // Handle process signals for cleanup
  process.on("SIGINT", exitApp);
  process.on("SIGTERM", exitApp);
  process.on("exit", cleanupTerminal);

  console.log("Use arrow keys or j/k to navigate, Enter to select, q to quit");
}

main().catch((err) => {
  cleanupTerminal();
  console.error(err);
  process.exit(1);
});
