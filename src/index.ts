import { 
  createCliRenderer, 
  BoxRenderable, 
  TextRenderable,
  SelectRenderable,
  SelectRenderableEvents,
  ASCIIFontRenderable,
  RGBA,
  ConsolePosition
} from "@opentui/core";

async function main() {
  // Create the renderer
  const renderer = await createCliRenderer({
    consoleOptions: {
      position: ConsolePosition.BOTTOM,
      sizePercent: 30,
      startInDebugMode: false,
    },
  });

  // Create title using ASCII font
  const title = new ASCIIFontRenderable(renderer, {
    id: "title",
    text: "SPOTIFY",
    font: "tiny",
    color: RGBA.fromHex("#1DB954"), // Spotify green
    position: "absolute",
    left: 2,
    top: 1,
  });

  // Create main container box
  const mainBox = new BoxRenderable(renderer, {
    id: "main-box",
    width: 60,
    height: 20,
    backgroundColor: "#1a1a1a",
    borderStyle: "rounded",
    borderColor: "#1DB954",
    title: "Music Player",
    titleAlignment: "center",
    position: "absolute",
    left: 2,
    top: 7,
  });

  // Create menu options
  const menu = new SelectRenderable(renderer, {
    id: "menu",
    width: 56,
    height: 15,
    options: [
      { name: "Now Playing", description: "View current track" },
      { name: "Library", description: "Browse your music library" },
      { name: "Search", description: "Search for songs, artists, albums" },
      { name: "Liked Songs", description: "Your favorite tracks" },
      { name: "Radio", description: "Discover new music" },
      { name: "Settings", description: "Configure the app" },
      { name: "Exit", description: "Quit the application" },
    ],
    position: "absolute",
    left: 4,
    top: 9,
    selectedBackgroundColor: "#1DB954",
  });

  // Create info text
  const infoText = new TextRenderable(renderer, {
    id: "info",
    content: "Use up/down or k/j to navigate | Enter to select | ` for console",
    fg: "#888888",
    position: "absolute",
    left: 2,
    top: 28,
  });

  // Handle menu selection
  (menu as any).on(SelectRenderableEvents.ITEM_SELECTED, (_index: number, option: { name: string; description: string }) => {
    console.log(`Selected: ${option.name}`);
    
    if (option.name === "Exit") {
      console.log("Goodbye!");
      process.exit(0);
    } else {
      console.log(`Opening: ${option.description}`);
    }
  });

  // Add components to the renderer
  renderer.root.add(title);
  renderer.root.add(mainBox);
  renderer.root.add(menu);
  renderer.root.add(infoText);

  // Focus the menu so it can receive input
  menu.focus();

  // Handle Ctrl+C to exit gracefully
  (renderer.keyInput as any).on("keypress", (key: { ctrl: boolean; name: string }) => {
    if (key.ctrl && key.name === "c") {
      console.log("Exiting...");
      process.exit(0);
    }
  });

  console.log("Spotify TUI started! Welcome to your music player.");
}

main().catch(console.error);
