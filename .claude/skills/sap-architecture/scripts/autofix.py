#!/usr/bin/env python3
"""Auto-fix mechanical issues in a .drawio file.

Fixes (in-place, writes if --write given):
  * Snap every x/y/width/height in <mxGeometry> to the 10-px grid (round half up)
  * Quantize floating-point widths (e.g. 239.9999...) to integers
  * Uppercase all hex color values in styles (outside data: URIs)
  * Add `absoluteArcSize=1` anywhere `arcSize=<n>` is set without it
  * Replace `strokeWidth=1.2` and similar odd values with the nearest allowed weight
  * Normalise the font family to `Helvetica` (warn only — style strings preserved)

Usage:
  autofix.py <file.drawio>           # dry-run, prints summary
  autofix.py --write <file.drawio>   # edits in place (makes a .bak copy)

Run validate.py afterwards — any remaining issues are authorial (bent edges,
overflow, palette deviations).
"""
from __future__ import annotations

import argparse
import re
import shutil
import sys
from pathlib import Path

GRID = 10
ALLOWED_STROKE_VALUES = (1.0, 1.5, 2.0, 3.0, 4.0)


def snap(v: float) -> int:
    return int(round(v / GRID) * GRID)


def fix_geometry(text: str, stats: dict[str, int]) -> str:
    def repl(m: re.Match[str]) -> str:
        attr, num = m.group(1), float(m.group(2))
        snapped = snap(num)
        if abs(num - snapped) > 0.001:
            stats["geometry"] += 1
        return f'{attr}="{snapped}"'

    return re.sub(r'\b(x|y|width|height)="(-?\d+(?:\.\d+)?)"', repl, text)


def fix_hex_case(text: str, stats: dict[str, int]) -> str:
    out_chunks: list[str] = []
    i = 0
    # naive split around data: URIs so we don't touch hex inside SVG payloads
    while i < len(text):
        m = re.search(r"data:image/[^&\";]+", text[i:])
        if not m:
            out_chunks.append(_fix_hex_chunk(text[i:], stats))
            break
        start, end = m.span()
        out_chunks.append(_fix_hex_chunk(text[i : i + start], stats))
        out_chunks.append(text[i + start : i + end])
        i += end
    return "".join(out_chunks)


def _fix_hex_chunk(chunk: str, stats: dict[str, int]) -> str:
    def repl(m: re.Match[str]) -> str:
        hex_val = m.group(0)
        up = hex_val.upper()
        if hex_val != up:
            stats["hex_case"] += 1
        return up

    return re.sub(r"#[0-9a-fA-F]{6}\b", repl, chunk)


def fix_arc_size(text: str, stats: dict[str, int]) -> str:
    # For each style="..." attribute value, if arcSize= appears without absoluteArcSize=1, add it.
    def repl(m: re.Match[str]) -> str:
        style_val = m.group(1)
        if "arcSize=" in style_val and "absoluteArcSize=" not in style_val:
            stats["arc_size"] += 1
            trailing = "" if style_val.endswith(";") else ";"
            return f'style="{style_val}{trailing}absoluteArcSize=1;"'
        return m.group(0)

    return re.sub(r'style="([^"]*)"', repl, text)


def fix_stroke_width(text: str, stats: dict[str, int]) -> str:
    def repl(m: re.Match[str]) -> str:
        val = float(m.group(1))
        nearest = min(ALLOWED_STROKE_VALUES, key=lambda x: abs(x - val))
        if abs(nearest - val) < 0.01:
            return m.group(0)
        stats["stroke_width"] += 1
        formatted = f"{nearest:g}"
        return f"strokeWidth={formatted}"

    return re.sub(r"strokeWidth=([0-9.]+)", repl, text)


def fix_font_family(text: str, stats: dict[str, int]) -> str:
    def repl(m: re.Match[str]) -> str:
        val = m.group(1)
        if val.lower() == "helvetica":
            return m.group(0)
        stats["font_family"] += 1
        return "fontFamily=Helvetica"

    return re.sub(r"fontFamily=([^;\"]+)", repl, text)


def apply_all(text: str) -> tuple[str, dict[str, int]]:
    stats = {"geometry": 0, "hex_case": 0, "arc_size": 0, "stroke_width": 0, "font_family": 0}
    text = fix_geometry(text, stats)
    text = fix_hex_case(text, stats)
    text = fix_arc_size(text, stats)
    text = fix_stroke_width(text, stats)
    text = fix_font_family(text, stats)
    return text, stats


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("file")
    ap.add_argument("--write", action="store_true", help="write the fix in place (backup .bak)")
    args = ap.parse_args()

    p = Path(args.file)
    if not p.exists():
        print(f"{p}: not found", file=sys.stderr)
        return 1

    original = p.read_text(encoding="utf-8")
    fixed, stats = apply_all(original)
    total = sum(stats.values())

    summary = ", ".join(f"{k}={v}" for k, v in stats.items() if v)
    if total == 0:
        print(f"{p}: no fixes needed")
        return 0

    if args.write:
        shutil.copyfile(p, p.with_suffix(p.suffix + ".bak"))
        p.write_text(fixed, encoding="utf-8")
        print(f"{p}: wrote ({total} fixes — {summary}); backup at {p.name}.bak")
    else:
        print(f"{p}: would fix ({total} changes — {summary}); re-run with --write")
    return 0


if __name__ == "__main__":
    sys.exit(main())
