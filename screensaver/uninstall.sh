#!/bin/bash
# Removes the Mythic Screensaver service and shortcuts. Your settings are kept unless you pass --purge.
set -uo pipefail
systemctl --user disable --now mythic-saver.service 2>/dev/null
rm -f ~/.config/systemd/user/mythic-saver.service ~/.local/share/applications/mythic-saver.desktop
DESKTOP="$(xdg-user-dir DESKTOP 2>/dev/null || echo "$HOME/Desktop")"
rm -f "$DESKTOP/mythic-saver.desktop"
systemctl --user daemon-reload
[ "${1:-}" = --purge ] && rm -rf ~/.config/mythic-saver
echo "Mythic Screensaver removed.${1:+ Settings deleted.} You can now delete this folder."
