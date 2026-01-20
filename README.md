# spotify-tui

A terminal user interface for Spotify, built with TypeScript and Bun.

## Requirements

- [Bun](https://bun.sh/) >= 1.0.0
- [Spotify Premium](https://www.spotify.com/premium/) account
- Linux or macOS

## Installation

```bash
git clone https://github.com/yourusername/spotify-tui.git
cd spotify-tui
bun install
```

The install script automatically downloads [spotifyd](https://github.com/Spotifyd/spotifyd) to `~/.spotify-tui/bin/`.

## Getting Started

```bash
bun start
```

On first run, you need to authenticate:

1. Press `Ctrl+P` to open the command palette
2. Select **Login to Spotify** - a browser opens for authorization
3. After authorizing, press `Ctrl+P` again
4. Select **Authenticate Spotifyd** - another browser authorization

Once both are complete, you are ready to listen to music.

## Navigation

| Key | Action |
|-----|--------|
| `h` / `l` | Focus library / content panel |
| `j` / `k` | Move down / up in lists |
| `Enter` | Select / Play item |
| `Escape` | Go back |
| `/` | Open search |
| `Ctrl+P` | Open command palette |

## Playback

| Key | Action |
|-----|--------|
| `Space` | Play / Pause |
| `w` | Next track |
| `b` | Previous track |
| `Left` / `Right` | Seek backward / forward (5s) |
| `+` / `-` | Volume up / down |
| `s` | Toggle shuffle |
| `r` | Cycle repeat mode |

## Queue

| Key | Action |
|-----|--------|
| `f` | Add selected track to queue |

Select a track in the content panel and press `f` to add it to your queue. The queue appears in the left sidebar below the library menu.

## Help

Press `?` to view all keyboard shortcuts.

Press `q` to quit.

## Command Palette

Press `Ctrl+P` to access commands:

| Command | Description |
|---------|-------------|
| Login to Spotify | Authenticate with Spotify |
| Logout | Clear stored credentials |
| Authenticate Spotifyd | Set up audio playback daemon |
| Start Spotifyd | Start the daemon |
| Stop Spotifyd | Stop the daemon |
| Restart Spotifyd | Restart the daemon |
| Activate Spotifyd | Make it the active playback device |

## Troubleshooting

### Playback not working

Make sure both authentications are complete:
1. `Ctrl+P` -> Login to Spotify
2. `Ctrl+P` -> Authenticate Spotifyd

### Re-authenticate

```bash
bun logout
bun start
```

Then authenticate again via the command palette.

### spotifyd issues

If the automatic download failed, install manually:

```bash
# Arch Linux
pacman -S spotifyd

# macOS
brew install spotifyd
```

Or download from [spotifyd releases](https://github.com/Spotifyd/spotifyd/releases).

## Development

```bash
bun dev          # Run in watch mode
bun tsc --noEmit # Type check
```

## Dependencies

- [Bun](https://bun.sh/) - JavaScript runtime
- [@opentui/core](https://github.com/nicholasgriffintn/opentui) - Terminal UI framework
- [spotifyd](https://github.com/Spotifyd/spotifyd) - Spotify Connect daemon for audio playback
- [dbus-next](https://github.com/dbusjs/node-dbus-next) - D-Bus bindings for MPRIS control
- [Zod](https://zod.dev/) - Schema validation

## License

MIT
