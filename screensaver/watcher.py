#!/usr/bin/python3
"""Mythic screensaver watcher.

Asks KWin (Wayland ext-idle-notify protocol) to tell us when the user has been idle for N seconds,
then starts the fullscreen saver. KWin's idle timer already pauses while an app inhibits idle
(video players, browsers playing video, many games); we additionally check KDE's D-Bus inhibition
list, so players that inhibit that way are respected too. Games that don't inhibit (Minecraft, many
Proton titles, controller play) are caught by looking for running game processes.

Privacy: this process prints nothing, writes no files and keeps no history. It only reads
~/.config/mythic-saver/config.json, and only peeks at the process list while you're idle.
"""
import json, os, select, shutil, socket, struct, subprocess, sys, tempfile, time
from gi.repository import Gio, GLib

HERE = os.path.dirname(os.path.abspath(__file__))
CONFIG = os.path.expanduser('~/.config/mythic-saver/config.json')
DEFAULTS = {'enabled': True, 'idleSeconds': 20, 'pauseForGames': True, 'extraGames': ''}
ELECTRON = [os.path.join(HERE, 'app', 'node_modules', 'electron', 'dist', 'electron'),
            os.path.join(HERE, 'app'), '--ozone-platform=x11', '--show']
SCREEN_INHIBIT = 4          # PowerDevil "ChangeScreenSettings": what video players request
GAME_MARKERS = ('SteamLaunch AppId=',                       # every Steam game (Proton too) runs under Steam's reaper with this
                'net.minecraft.client', 'KnotClient',  # Minecraft Java: vanilla / Fabric
                'cpw.mods', 'org.quiltmc',             # Minecraft Java: Forge / Quilt
                'org.prismlauncher.EntryPoint',        # Minecraft via Prism / MultiMC / PolyMC (real class arrives on stdin)
                'org.multimc.EntryPoint', 'org.polymc.EntryPoint')
GAME_PROCESSES = {'wineserver', 'gamescope', 'gamescope-wl'}   # Wine games (Lutris/Heroic/Bottles), gamescope


def game_running(extra):
    """True if a game process is running. extra: lowercase names the user added in settings."""
    for pid in os.listdir('/proc'):
        if not pid.isdigit():
            continue
        try:
            with open(f'/proc/{pid}/comm') as f:
                comm = f.read().strip()
            with open(f'/proc/{pid}/cmdline', 'rb') as f:
                cmd = f.read().replace(b'\0', b' ').decode(errors='replace')
        except OSError:
            continue
        if comm in GAME_PROCESSES or any(m in cmd for m in GAME_MARKERS):
            return True
        if comm == 'java' and 'lwjgl' in cmd:                      # any LWJGL Java game, whatever the launcher
            return True
        exe = os.path.basename(cmd.split(' ', 1)[0]).lower()
        if any(e in comm.lower() or e in exe for e in extra):
            return True
    return False


class Wayland:
    """Just enough of the Wayland wire protocol for ext_idle_notifier_v1."""

    def __init__(self):
        path = os.path.join(os.environ['XDG_RUNTIME_DIR'], os.environ.get('WAYLAND_DISPLAY', 'wayland-0'))
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.connect(path)
        self.buf = b''
        self.next_id = 2
        self.seat = self.notifier = self.notification = None
        self.events = []

        self.registry = self.new_id()
        self.send(1, 1, struct.pack('<I', self.registry))         # wl_display.get_registry
        sync = self.new_id()
        self.send(1, 0, struct.pack('<I', sync))                  # wl_display.sync → callback.done ends the global list
        globals_ = {}
        while not any(obj == sync for obj, _, _ in self.events):
            self.read()
        for obj, op, body in self.events:
            if obj == self.registry and op == 0:                   # wl_registry.global
                name, n = struct.unpack_from('<II', body)
                iface = body[8:8 + n - 1].decode()
                globals_[iface] = name
        self.events.clear()
        if 'ext_idle_notifier_v1' not in globals_ or 'wl_seat' not in globals_:
            sys.exit(1)
        self.seat = self.bind(globals_['wl_seat'], 'wl_seat', 1)
        self.notifier = self.bind(globals_['ext_idle_notifier_v1'], 'ext_idle_notifier_v1', 1)

    def new_id(self):
        self.next_id += 1
        return self.next_id - 1

    def send(self, obj, opcode, args=b''):
        self.sock.sendall(struct.pack('<II', obj, ((8 + len(args)) << 16) | opcode) + args)

    @staticmethod
    def string(s):
        b = s.encode() + b'\0'
        return struct.pack('<I', len(b)) + b + b'\0' * (-len(b) % 4)

    def bind(self, name, iface, version):
        oid = self.new_id()
        self.send(self.registry, 0, struct.pack('<I', name) + self.string(iface) + struct.pack('<II', version, oid))
        return oid

    def watch_idle(self, seconds):
        if self.notification:
            self.send(self.notification, 0)                        # ext_idle_notification_v1.destroy
        self.notification = self.new_id()
        self.send(self.notifier, 1, struct.pack('<III', self.notification, int(seconds * 1000), self.seat))

    def read(self):
        data = self.sock.recv(65536)
        if not data:
            sys.exit(1)                                            # compositor went away; systemd restarts us
        self.buf += data
        while len(self.buf) >= 8:
            obj, so = struct.unpack_from('<II', self.buf)
            size = so >> 16
            if len(self.buf) < size:
                break
            body, self.buf = self.buf[8:size], self.buf[size:]
            if obj == 1 and (so & 0xffff) == 0:                    # wl_display.error
                sys.exit(1)
            self.events.append((obj, so & 0xffff, body))

    def poll(self, timeout):
        """Returns 'idled', 'resumed' or None."""
        if select.select([self.sock], [], [], timeout)[0]:
            self.read()
        result = None
        for obj, op, _ in self.events:
            if obj == self.notification:
                result = 'idled' if op == 0 else 'resumed'
        self.events.clear()
        return result


class Session:
    def __init__(self):
        self.bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)

    def call(self, dest, path, iface, method, args=None):
        try:
            return self.bus.call_sync(dest, path, iface, method, args, None, Gio.DBusCallFlags.NONE, 1000, None).unpack()
        except GLib.Error:
            return None

    def video_inhibited(self):
        r = self.call('org.kde.Solid.PowerManagement', '/org/kde/Solid/PowerManagement/PolicyAgent',
                      'org.kde.Solid.PowerManagement.PolicyAgent', 'HasInhibition', GLib.Variant('(u)', (SCREEN_INHIBIT,)))
        return bool(r and r[0])

    def locked(self):
        r = self.call('org.freedesktop.ScreenSaver', '/org/freedesktop/ScreenSaver',
                      'org.freedesktop.ScreenSaver', 'GetActive')
        return bool(r and r[0])


def load_config():
    try:
        with open(CONFIG) as f:
            return {**DEFAULTS, **json.load(f)}
    except (OSError, ValueError):
        return dict(DEFAULTS)


def config_mtime():
    try:
        return os.stat(CONFIG).st_mtime
    except OSError:
        return 0


def main():
    wl, session = Wayland(), Session()
    cfg, mtime = load_config(), config_mtime()
    wl.watch_idle(cfg['idleSeconds'])

    idle = False          # KWin says the user is idle (and no Wayland inhibitor is active)
    clear_since = None    # when we last saw "idle and nothing inhibiting"
    shown = False         # saver already shown during this idle period
    saver = profile = None

    def start_saver():
        nonlocal saver, profile
        profile = tempfile.mkdtemp(prefix=f'mythic-saver-{os.getpid()}-')
        saver = subprocess.Popen(ELECTRON, env={**os.environ, 'MYTHIC_PROFILE': profile}, stdin=subprocess.DEVNULL,
                                 stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)

    def stop_saver():
        nonlocal saver, profile
        if saver:
            if saver.poll() is None:
                saver.terminate()
                try:
                    saver.wait(5)
                except subprocess.TimeoutExpired:
                    saver.kill(); saver.wait()
            shutil.rmtree(profile, ignore_errors=True)            # leave nothing behind
        saver = profile = None

    while True:
        ev = wl.poll(2.0)
        now = time.monotonic()
        if ev == 'idled':
            idle, clear_since, shown = True, now, False
        elif ev == 'resumed':
            idle, clear_since, shown = False, None, False
            stop_saver()

        if config_mtime() != mtime:
            new, mtime = load_config(), config_mtime()
            if new['idleSeconds'] != cfg['idleSeconds']:
                wl.watch_idle(new['idleSeconds'])
                idle, clear_since, shown = False, None, False
            cfg = new

        if saver and saver.poll() is not None:
            stop_saver()
        if not idle or shown or saver or not cfg['enabled']:
            continue
        extra = [e.strip().lower() for e in str(cfg.get('extraGames', '')).split(',') if e.strip()]
        if session.video_inhibited() or session.locked() or (cfg['pauseForGames'] and game_running(extra)):
            clear_since = None                                     # video/game running: wait for it to stop
            continue
        if clear_since is None:
            clear_since = now
        if now - clear_since >= cfg['idleSeconds'] or ev == 'idled':
            start_saver()
            shown = True


if __name__ == '__main__':
    main()
