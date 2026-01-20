#!/usr/bin/env bash

# Clean up script for testing fresh installs of openspot-tui

echo "Cleaning up openspot-tui data..."

# Remove config and cache directories
rm -rf ~/.config/spotify-tui
rm -rf ~/.cache/spotify-tui
rm -rf ~/.spotify-tui

# Remove global install
echo "Removing global install..."
bun remove -g openspot-tui 2>/dev/null || true

# Clear bun cache for this package
echo "Clearing bun cache..."
rm -rf ~/.bun/install/cache/openspot-tui* 2>/dev/null || true

echo ""
echo "Done! Ready for fresh install test."
echo ""
echo "To test:"
echo "  bunx openspot-tui"
