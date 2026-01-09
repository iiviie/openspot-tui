# spotify-tui

A beautiful terminal user interface for Spotify, built with TypeScript and Bun.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Platform](https://img.shields.io/badge/platform-linux%20%7C%20macOS-lightgrey.svg)
![Bun](https://img.shields.io/badge/bun-%3E%3D1.0.0-orange.svg)

## Features

- **Full Spotify Control** - Play, pause, skip, seek, and control volume
- **Library Browsing** - View saved tracks, albums, playlists, and artists
- **Search** - Find tracks, albums, artists, and playlists
- **Queue Management** - View and manage your playback queue
- **Now Playing** - Real-time progress bar and track information
- **Keyboard Driven** - Vim-inspired navigation and shortcuts
- **Dynamic Resize** - UI adapts to terminal size changes
- **Single Terminal** - Automatically manages spotifyd daemon

## Requirements

- [Bun](https://bun.sh/) >= 1.0.0
- [Spotify Premium](https://www.spotify.com/premium/) account
- Linux or macOS (Windows not currently supported)
- D-Bus (for MPRIS media control)

## Installation

### From Source

```bash
git clone https://github.com/yourusername/spotify-tui.git
cd spotify-tui
bun install
```

The postinstall script will automatically download `spotifyd` if not found on your system.

### Spotify Developer Setup

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Create a new application
3. Add `http://localhost:8888/callback` as a Redirect URI
4. Note your **Client ID** and **Client Secret**
5. Set environment variables:

```bash
export SPOTIFY_CLIENT_ID="your_client_id"
export SPOTIFY_CLIENT_SECRET="your_client_secret"
```

Or create a `.env` file in the project root:

```env
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
```

## Usage

```bash
# Run the application
bun start

# Run in development mode (auto-reload)
bun dev

# Log out (clear stored credentials)
bun logout
```

On first run, a browser window will open for Spotify authentication. After authorizing, you'll be redirected back and can start using the TUI.

## Keyboard Shortcuts

### Navigation

| Key | Action |
|-----|--------|
| `Tab` | Switch focus between panels |
| `j` / `Down` | Move down |
| `k` / `Up` | Move up |
| `Enter` | Select / Play item |
| `Esc` | Cancel / Go back |
| `/` | Focus search bar |

### Playback

| Key | Action |
|-----|--------|
| `Space` | Play / Pause |
| `n` | Next track |
| `p` | Previous track |
| `+` / `=` | Volume up |
| `-` | Volume down |
| `s` | Toggle shuffle |
| `r` | Cycle repeat mode |

### General

| Key | Action |
|-----|--------|
| `q` | Quit application |
| `?` | Show help |

## Configuration

Configuration is stored in `~/.config/spotify-tui/`:

```
~/.config/spotify-tui/
├── credentials.json    # OAuth tokens (auto-generated)
└── config.json         # User preferences (optional)
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `SPOTIFY_CLIENT_ID` | Your Spotify app client ID |
| `SPOTIFY_CLIENT_SECRET` | Your Spotify app client secret |
| `SPOTIFY_TUI_SPOTIFYD_PATH` | Custom path to spotifyd binary |
| `SPOTIFY_TUI_SKIP_DOWNLOAD` | Set to `1` to skip spotifyd download |

## Architecture

```
src/
├── index.ts           # Entry point
├── app.ts             # Main App class
├── components/        # UI components
│   ├── Sidebar.ts         # Library menu
│   ├── ContentWindow.ts   # Main content area
│   ├── SearchBar.ts       # Search input
│   ├── NowPlaying.ts      # Playback bar
│   ├── StatusSidebar.ts   # Queue & status
│   └── Queue.ts           # Queue display
├── services/          # Business logic
│   ├── AuthService.ts     # OAuth flow
│   ├── SpotifyApiService.ts # Web API
│   ├── MprisService.ts    # D-Bus MPRIS
│   ├── SpotifydManager.ts # Daemon control
│   └── CacheService.ts    # Response cache
├── schemas/           # Zod validation
├── types/             # TypeScript types
├── config/            # Constants
└── utils/             # Helpers
```

### Tech Stack

- **Runtime**: [Bun](https://bun.sh/) - Fast JavaScript runtime
- **TUI Framework**: [@opentui/core](https://www.npmjs.com/package/@opentui/core) - Terminal UI library
- **D-Bus**: [dbus-next](https://www.npmjs.com/package/dbus-next) - MPRIS media control
- **Validation**: [Zod](https://zod.dev/) - Schema validation
- **Daemon**: [spotifyd](https://github.com/Spotifyd/spotifyd) - Spotify Connect client

## Development

```bash
# Type check
bun tsc --noEmit

# Run in watch mode
bun dev

# Test auth flow
bun auth

# Test MPRIS connection
bun mpris
```

## Troubleshooting

### "No Spotify session found"

Make sure spotifyd is running. The app should start it automatically, but you can verify:

```bash
pgrep spotifyd
```

If not running, check the logs or start manually:

```bash
spotifyd --no-daemon
```

### "Failed to connect to D-Bus"

Ensure D-Bus is running:

```bash
# Linux
systemctl --user status dbus

# Or start it
dbus-daemon --session --fork
```

### Authentication issues

Clear credentials and re-authenticate:

```bash
bun logout
bun start
```

### spotifyd not downloading

If the automatic download fails, install spotifyd manually:

```bash
# Arch Linux
pacman -S spotifyd

# macOS
brew install spotifyd

# Or download from releases
# https://github.com/Spotifyd/spotifyd/releases
```

Then set the path:

```bash
export SPOTIFY_TUI_SKIP_DOWNLOAD=1
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [spotifyd](https://github.com/Spotifyd/spotifyd) - The Spotify daemon that makes this possible
- [spotify-tui (Rust)](https://github.com/Rigellute/spotify-tui) - Inspiration for this project
- [@opentui/core](https://github.com/nicholasgriffintn/opentui) - Terminal UI framework
