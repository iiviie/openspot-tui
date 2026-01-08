import { 
  createCliRenderer, 
  BoxRenderable, 
  TextRenderable,
  ConsolePosition
} from "@opentui/core";

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

  // Track selected menu item
  let selectedIndex = 0;
  const menuItems: TextRenderable[] = [];

  // ============ LEFT SIDEBAR ============
  
  const sidebar = new BoxRenderable(renderer, {
    id: "sidebar",
    width: 18,
    height: 24,
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
    width: 62,
    height: 24,
    backgroundColor: colors.bg,
    borderStyle: "single",
    borderColor: colors.border,
    position: "absolute",
    left: 18,
    top: 0,
  });

  const nowPlayingLabel = new TextRenderable(renderer, {
    id: "now-playing-label",
    content: "NOW PLAYING",
    fg: colors.textDim,
    position: "absolute",
    left: 20,
    top: 1,
  });

  const trackTitle = new TextRenderable(renderer, {
    id: "track-title",
    content: `Track: ${currentTrack.title}`,
    fg: colors.textPrimary,
    position: "absolute",
    left: 20,
    top: 3,
  });

  const trackArtist = new TextRenderable(renderer, {
    id: "track-artist",
    content: `Artist: ${currentTrack.artist} | Album: ${currentTrack.album}`,
    fg: colors.textSecondary,
    position: "absolute",
    left: 20,
    top: 4,
  });

  // Progress bar
  const barWidth = 40;
  const filled = Math.floor(barWidth * currentTrack.progress);
  const progressBar = new TextRenderable(renderer, {
    id: "progress-bar",
    content: `[${"=".repeat(filled)}${"-".repeat(barWidth - filled)}]`,
    fg: colors.textSecondary,
    position: "absolute",
    left: 20,
    top: 6,
  });

  const timeDisplay = new TextRenderable(renderer, {
    id: "time-display",
    content: `${currentTrack.currentTime} / ${currentTrack.totalTime}`,
    fg: colors.textDim,
    position: "absolute",
    left: 63,
    top: 6,
  });

  // ============ QUEUE ============
  
  const queueLabel = new TextRenderable(renderer, {
    id: "queue-label",
    content: "QUEUE",
    fg: colors.textDim,
    position: "absolute",
    left: 20,
    top: 8,
  });

  const queueItems: TextRenderable[] = [];
  queue.forEach((track, index) => {
    const text = track.artist 
      ? `${track.title} - ${track.artist}`
      : `${track.title} | Album: ${track.album}`;
    
    const queueItem = new TextRenderable(renderer, {
      id: `queue-${index}`,
      content: text,
      fg: index === 0 ? colors.highlight : colors.textSecondary,
      position: "absolute",
      left: 20,
      top: 10 + index,
    });
    queueItems.push(queueItem);
  });

  // ============ STATUS BAR ============
  
  const statusBar = new BoxRenderable(renderer, {
    id: "status-bar",
    width: 80,
    height: 3,
    backgroundColor: colors.bgSecondary,
    borderStyle: "single",
    borderColor: colors.border,
    position: "absolute",
    left: 0,
    top: 24,
  });

  const statusText = new TextRenderable(renderer, {
    id: "status-text",
    content: `Playing: ${currentTrack.title} - ${currentTrack.artist}`,
    fg: colors.textSecondary,
    position: "absolute",
    left: 2,
    top: 25,
  });

  const controls = new TextRenderable(renderer, {
    id: "controls",
    content: "[<] [>] [||]",
    fg: colors.textDim,
    position: "absolute",
    left: 65,
    top: 25,
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

  // Handle keyboard input
  (renderer.keyInput as any).on("keypress", (key: { ctrl: boolean; name: string }) => {
    if (key.ctrl && key.name === "c") {
      process.exit(0);
    }
    if (key.name === "q") {
      process.exit(0);
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

  console.log("Use arrow keys or j/k to navigate, Enter to select, q to quit");
}

main().catch(console.error);
