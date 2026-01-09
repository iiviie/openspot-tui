# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-01-10

### Added

- **Core TUI Application**
  - Terminal UI for Spotify with keyboard-driven navigation
  - Library sidebar with playlists, saved tracks, albums, and artists
  - Content window for browsing tracks and playlists
  - Search functionality with real-time results
  - Now Playing bar with progress indicator
  - Status sidebar with playback info and queue

- **Spotify Integration**
  - OAuth 2.0 authentication with PKCE
  - Spotify Web API integration for library browsing
  - MPRIS D-Bus integration for playback control via spotifyd
  - Playback controls: play/pause, next/previous, seek, volume

- **spotifyd Management**
  - Automatic spotifyd daemon lifecycle management
  - Binary auto-download on package install (Linux x64 & ARM64, macOS x64 & ARM64)
  - Single-terminal experience (no separate spotifyd terminal needed)

- **Developer Experience**
  - TypeScript with strict mode
  - Zod schemas for API response validation
  - Biome for linting and formatting
  - Comprehensive AGENTS.md for AI coding assistance

- **Dynamic Features**
  - Terminal resize handling with automatic layout recalculation
  - Credential caching for persistent login
  - Response caching for improved performance

### Technical Details

- **Runtime**: Bun >= 1.0.0
- **Platforms**: Linux, macOS
- **Dependencies**:
  - @opentui/core - Terminal UI framework
  - dbus-next - D-Bus MPRIS integration
  - zod - Schema validation
  - open - Browser launch for OAuth

## [Unreleased]

### Planned

- Offline mode / better error handling when Spotify is unreachable
- spotifyd configuration file generation
- First-run setup wizard
- Test suite with Bun's built-in test runner
- Album and artist browsing views
- Playlist creation and management
