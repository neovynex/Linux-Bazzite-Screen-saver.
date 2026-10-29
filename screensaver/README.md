# Mythic Screensaver

Made by **SoulOfMythic**, built with the help of [Claude Code](https://claude.com/claude-code).
Claude Code was only used to write the code. The screensaver itself does not use Claude or any AI,
needs no internet connection, and collects no data (see **Private** below).

> I used AI to make this, but at least it doesn't collect any data. I'm making it open source,
> but y'all need to credit me if you use my code.

An old-school screensaver for **KDE Plasma 6 on Wayland** (made on Bazzite), which no longer ships one.
After a short idle time a fullscreen animation appears on every monitor; any key, click or mouse
movement closes it.

The default **Mythic** animation is a flying starfield with a chunky, glossy, rainbow-shifting
MYTHIC logo. Also included: Starfield, 3D Pipes, Mystify, Matrix, Bounce (custom text), Plasma and Random.

## Features

- **Stays away during videos**: respects apps that block idle (browsers, video players)
- **Stays away while gaming**: Steam / Proton games, Minecraft Java (any launcher, incl. Prism),
  Lutris / Heroic / Bottles (Wine), gamescope, plus any program names you add
- **Private**: no logs, no history, no network. The service writes nothing to the journal, and the
  saver's temporary browser profile is deleted every time it closes. The only file kept is your
  settings in `~/.config/mythic-saver/config.json`.
- **Settings window**: on/off, idle time (10 s – 10 min), animation, frame rate (24–60 fps or max),
  game detection, live preview

## Requirements

- KDE Plasma 6, Wayland session (uses the `ext-idle-notify-v1` protocol)
- `/usr/bin/python3` with PyGObject (`gi`), which is preinstalled on most KDE distros
- Node.js / npm (only to download Electron during install)

## Install

```bash
bash install.sh
```

This downloads Electron into `app/node_modules`, enables the `mythic-saver` user service and adds a
**Mythic Screensaver** shortcut to the app menu and Desktop. Keep the folder where it is, because the
service runs from it.

Preview the animations in a browser without installing: open `preview.html` (keys 1–8, F = fullscreen).

## Uninstall

```bash
bash uninstall.sh           # keeps your settings
bash uninstall.sh --purge   # also deletes ~/.config/mythic-saver
```

## How it works

| File | Role |
| --- | --- |
| `watcher.py` | Background service. A tiny pure-Python Wayland client asks KWin for an idle notification, then checks KDE's inhibitions, the lock screen and running games before launching the saver. |
| `app/main.js` | Electron: `--show` opens the saver on every monitor; without flags it opens the settings window. |
| `app/savers.js` | All animations (canvas), shared by the saver and `preview.html`. |
| `mythic-saver` | Launcher for the settings window; gives Electron a throwaway profile and deletes it afterwards. |

## License

MIT © 2026 SoulOfMythic. You're free to use, change and share it, as long as you keep the
credit and the [LICENSE](LICENSE) file.
