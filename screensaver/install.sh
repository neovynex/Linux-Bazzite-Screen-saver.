#!/bin/bash
# Installs Mythic Screensaver for the current user: downloads Electron, sets up the background
# service (starts with your login) and adds a "Mythic Screensaver" shortcut to the app menu and Desktop.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"

need() { command -v "$1" >/dev/null || { echo "Missing: $1 ($2)"; exit 1; }; }
need npm "install Node.js, e.g. via nvm or your package manager"
need systemctl "a systemd-based distro is required"
/usr/bin/python3 -c 'import gi' 2>/dev/null || { echo "Missing: PyGObject for /usr/bin/python3 (python3-gobject)"; exit 1; }
[ "${XDG_SESSION_TYPE:-}" = wayland ] || echo "Note: made for KDE Plasma 6 on Wayland; other setups may not work."

echo "Installing Electron…"
(cd "$DIR/app" && npm ci --no-audit --no-fund --loglevel=error)
chmod +x "$DIR/mythic-saver" "$DIR/watcher.py" "$DIR/uninstall.sh"

echo "Setting up background service…"
mkdir -p ~/.config/systemd/user ~/.local/share/applications
sed "s#@DIR@#$DIR#g" "$DIR/packaging/mythic-saver.service.in" > ~/.config/systemd/user/mythic-saver.service
systemctl --user daemon-reload
systemctl --user enable --now mythic-saver.service

echo "Adding shortcuts…"
sed "s#@DIR@#$DIR#g" "$DIR/packaging/mythic-saver.desktop.in" > ~/.local/share/applications/mythic-saver.desktop
DESKTOP="$(xdg-user-dir DESKTOP 2>/dev/null || echo "$HOME/Desktop")"
if [ -d "$DESKTOP" ]; then
  cp ~/.local/share/applications/mythic-saver.desktop "$DESKTOP/mythic-saver.desktop"
  chmod +x "$DESKTOP/mythic-saver.desktop"
fi

echo "Done! Mythic Screensaver appears after 20 s idle. Open \"Mythic Screensaver\" to change settings."
