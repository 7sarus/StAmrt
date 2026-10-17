#!/usr/bin/env python3
"""
stamrt-theme — feed StAmrt's start page the colours Noctalia is currently using.

Reads three files Noctalia rewrites itself on every wallpaper / theme-mode change:

  ~/.config/gtk-3.0/noctalia.css   the Material 3 roles as GTK @define-color
  ~/.cache/wal/colors.json         the 16-slot palette Noctalia hands to
                                   pywalfox, i.e. what Firefox itself wears
  ~/.local/state/noctalia/settings.toml
                                   the active wallpaper, so the page can show
                                   it behind an accent-tinted veil

Writes theme.css next to this script. Wired into
~/.config/noctalia/hooks.toml as `colors_changed`.

The Firefox add-on under addons/firefox/ cannot load file:// images, so with
`--addon <dir>` the wallpaper is copied into that directory and referenced
relatively instead.

The page falls back to its built-in dark palette if this never runs, so the
start page still looks right on a machine without Noctalia.
"""

import argparse
import json
import os
import re
import shutil
import sys
import tomllib

GTK = os.path.expanduser("~/.config/gtk-3.0/noctalia.css")
GTK4 = os.path.expanduser("~/.config/gtk-4.0/noctalia.css")
WAL = os.path.expanduser("~/.cache/wal/colors.json")
SETTINGS = os.path.expanduser("~/.local/state/noctalia/settings.toml")
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "theme.css")

# Used when Noctalia has not written its files yet.
FALLBACK = {
    "bg": "#14161a",
    "tile": "#1e2126",
    "tile-hover": "#262a31",
    "border": "#2b2f36",
    "text": "#e8eaed",
    "muted": "#9aa0a6",
    "accent": "#6aa9ff",
    "accent-on": "#0d1117",
    "danger": "#ff6b6b",
}


def read_gtk_defines(path):
    """Return {'accent_bg_color': '#fff', ...}, resolving @other_color refs."""
    if not os.path.exists(path):
        return {}
    with open(path, encoding="utf-8") as handle:
        text = handle.read()

    defines = dict(
        re.findall(r"@define-color\s+([\w-]+)\s+(#[0-9a-fA-F]{3,8})", text)
    )

    # Second pass: replace @name references with the literal they point at.
    for _ in range(5):
        unresolved = False
        for key, value in list(defines.items()):
            ref = re.fullmatch(r"@([\w-]+)", value)
            if ref and ref.group(1) in defines:
                defines[key] = defines[ref.group(1)]
            elif ref:
                unresolved = True
        if not unresolved:
            break
    return defines


def read_wal():
    if not os.path.exists(WAL):
        return {}
    try:
        with open(WAL, encoding="utf-8") as handle:
            return json.load(handle).get("colors", {})
    except (json.JSONDecodeError, OSError):
        return {}


def read_wallpaper():
    """Active wallpaper path, or None when Noctalia has none / it is gone."""
    if not os.path.exists(SETTINGS):
        return None
    try:
        with open(SETTINGS, "rb") as handle:
            data = tomllib.load(handle)
    except (tomllib.TOMLDecodeError, OSError):
        return None

    wallpaper = data.get("wallpaper", {})
    path = wallpaper.get("default", {}).get("path")
    if not path or not os.path.exists(path):
        return None
    return path


def hex_to_rgba(value, alpha):
    value = value.lstrip("#")
    if len(value) == 3:
        value = "".join(c * 2 for c in value)
    r, g, b = (int(value[i : i + 2], 16) for i in (0, 2, 4))
    return f"rgba({r}, {g}, {b}, {alpha})"


def mix(first, second, amount):
    """Blend two hex colours; amount 0 keeps `first`, 1 returns `second`."""
    def channels(value):
        value = value.lstrip("#")
        if len(value) == 3:
            value = "".join(c * 2 for c in value)
        return [int(value[i : i + 2], 16) for i in (0, 2, 4)]

    a, b = channels(first), channels(second)
    blended = [round(x + (y - x) * amount) for x, y in zip(a, b)]
    return "#" + "".join(f"{c:02x}" for c in blended)


def build(addon_dir=None):
    gtk = read_gtk_defines(GTK) or read_gtk_defines(GTK4)
    wal = read_wal()

    def pick(gtk_name, wal_name):
        return gtk.get(gtk_name) or wal.get(wal_name) or None

    bg = pick("window_bg_color", "color0")
    tile = pick("card_bg_color", "color7")
    text = pick("window_fg_color", "color15")
    accent = pick("accent_bg_color", "color3")
    accent_on = pick("accent_fg_color", None)

    # Noctalia's GTK export has one elevation level, so the hover, border and
    # muted roles are derived from it rather than read.
    headerbar = pick("headerbar_bg_color", None)
    tile_hover = (
        headerbar
        if headerbar and headerbar.lower() != tile.lower()
        else mix(tile, text, 0.12)
    )
    muted = mix(text, bg, 0.38)

    values = {
        "bg": bg,
        "bg-deep": pick("view_bg_color", "color0"),
        "tile": tile,
        "tile-hover": tile_hover,
        "border": mix(tile, text, 0.07),
        "text": text,
        "muted": muted,
        "accent": accent,
        "accent-on": accent_on,
        "danger": pick("destructive_bg_color", None),
    }

    resolved = {key: value or FALLBACK.get(key, "#888888") for key, value in values.items()}

    lines = [
        "/*",
        " * Generated by noctalia/stamrt-theme.py — do not edit by hand.",
        " * Regenerated on Noctalia's colors_changed hook.",
        " */",
        "",
        ":root {",
        '  color-scheme: dark;',
        "",
    ]

    for key in ("bg", "bg-deep", "tile", "tile-hover", "border", "text", "muted", "accent", "accent-on", "danger"):
        lines.append(f"  --{key}: {resolved[key]};")

    lines.append(f"  --scrim: {hex_to_rgba(resolved['bg-deep'], 0.6)};")
    lines.append("")

    # Wallpaper shown behind an accent-tinted veil, so the page picks up the
    # desktop without losing contrast for the tiles.
    wallpaper = read_wallpaper()
    if addon_dir:
        reference = copy_wallpaper(addon_dir, wallpaper)
    elif wallpaper:
        reference = f'url("file://{wallpaper}")'
    else:
        reference = "none"

    lines.append(f"  --wallpaper: {reference};")
    lines.append(f"  --accent-veil: {hex_to_rgba(resolved['accent'], 0.16)};")
    lines.append(f"  --shade: {hex_to_rgba(resolved['bg-deep'], 0.55)};")
    lines.append("")
    lines.append("  /* Pywalfox palette — the same slots Firefox is themed from. */")

    for slot in range(16):
        value = wal.get(f"color{slot}")
        if value:
            lines.append(f"  --wal-color{slot}: {value};")

    lines.append("}")
    return "\n".join(lines) + "\n"


def copy_wallpaper(addon_dir, wallpaper):
    """Copy the wallpaper into the add-on and return its relative CSS url.

    A moz-extension page cannot load file:// images, so the file has to sit
    inside the extension. The mtime is folded into the url as a cache-buster,
    because an add-on's own files are cached aggressively.
    """
    if not wallpaper:
        return "none"

    destination = os.path.join(addon_dir, "wallpaper" + os.path.splitext(wallpaper)[1].lower())
    try:
        if os.path.exists(destination) and os.path.getmtime(destination) == os.path.getmtime(wallpaper):
            pass
        else:
            shutil.copyfile(wallpaper, destination)
    except OSError:
        return "none"

    stamp = int(os.path.getmtime(destination))
    return f'url("wallpaper{os.path.splitext(wallpaper)[1].lower()}?v={stamp}")'


def write(path, content):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    # Write-then-rename so an interrupted run cannot leave a half-written file.
    tmp = f"{path}.tmp"
    with open(tmp, "w", encoding="utf-8") as handle:
        handle.write(content)
    os.replace(tmp, path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--addon",
        metavar="DIR",
        help="also write DIR/theme.css with the wallpaper copied inside it",
    )
    parser.add_argument("--stdout", action="store_true", help="print the CSS instead of writing it")
    args = parser.parse_args()

    if args.stdout:
        sys.stdout.write(build())
        return

    write(OUT, build())

    if args.addon:
        addon_dir = os.path.abspath(args.addon)
        write(os.path.join(addon_dir, "theme.css"), build(addon_dir=addon_dir))


if __name__ == "__main__":
    main()
