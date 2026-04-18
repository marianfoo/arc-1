#!/usr/bin/env python3
"""Validate a .drawio file.

Checks:
  * XML is well-formed
  * No <!-- ... --> comments
  * Every mxCell id is unique
  * Every vertex / edge mxCell has an mxGeometry child
  * (Warning only) Palette colors outside the SAP family

Exit code 0 on success, 1 on errors, 2 on usage error.
Run: python3 validate_drawio.py <file.drawio> [...]
"""
from __future__ import annotations

import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

SAP_PALETTE = {
    # Primary SAP Architecture Center palette
    "#0070F2", "#EBF8FF", "#002A86", "#00185A", "#475E75", "#F5F6F7",
    "#5D36FF", "#F1ECFF", "#188918", "#F5FAE5", "#266F3A",
    "#CC00DC", "#FFF0FA", "#07838F", "#DAFDF5", "#556B82",
    "#1D2D3E",
    # Common neutrals
    "#FFFFFF", "#FFF", "#000000", "#000",
    # SAP ref-arch palette variations seen in bundled templates
    "#1A2733", "#354A5F", "#475E74", "#475F75", "#5B738B",
    "#595959", "#EAECEE", "#EAF8FF",
    # Joule/accent variants
    "#470BED", "#7F00FF",
}

COMMENT_RE = re.compile(r"<!--.*?-->", re.S)
HEX_RE = re.compile(r"#[0-9A-Fa-f]{6}\b")


def validate(path: Path) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    text = path.read_text(encoding="utf-8")

    if COMMENT_RE.search(text):
        errors.append("contains XML comments (<!-- -->) — strip them")

    try:
        root = ET.fromstring(text)
    except ET.ParseError as exc:
        errors.append(f"XML parse error: {exc}")
        return errors, warnings

    ids: dict[str, int] = {}
    for cell in root.iter("mxCell"):
        cid = cell.get("id")
        if cid is None:
            errors.append("mxCell missing id")
            continue
        ids[cid] = ids.get(cid, 0) + 1

        is_vertex = cell.get("vertex") == "1"
        is_edge = cell.get("edge") == "1"
        if (is_vertex or is_edge) and cell.find("mxGeometry") is None:
            errors.append(f"mxCell id={cid!r} is vertex/edge but has no <mxGeometry> child")

    for cid, count in ids.items():
        if count > 1:
            errors.append(f"duplicate mxCell id={cid!r} ({count}×)")

    # Exclude hex values inside data:image/ URIs (icon SVG payloads have their own colors)
    palette_text = re.sub(r"data:image/[^&\";]+", "", text)
    palette_upper = {c.upper() for c in SAP_PALETTE if c.startswith("#")}
    foreign = {m.upper() for m in HEX_RE.findall(palette_text)} - palette_upper
    if foreign:
        warnings.append(
            "foreign palette colors (not in SAP family): " + ", ".join(sorted(foreign))
        )

    return errors, warnings


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print("usage: validate_drawio.py <file.drawio> [...]", file=sys.stderr)
        return 2

    exit_code = 0
    for arg in argv[1:]:
        path = Path(arg)
        if not path.exists():
            print(f"{path}: not found", file=sys.stderr)
            exit_code = 1
            continue
        errors, warnings = validate(path)
        prefix = f"{path}:"
        if not errors and not warnings:
            print(f"{prefix} OK")
            continue
        for w in warnings:
            print(f"{prefix} warning: {w}")
        for e in errors:
            print(f"{prefix} error: {e}")
        if errors:
            exit_code = 1
    return exit_code


if __name__ == "__main__":
    sys.exit(main(sys.argv))
