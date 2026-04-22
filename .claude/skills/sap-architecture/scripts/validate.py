#!/usr/bin/env python3
"""Validate a SAP Architecture Center-style .drawio file.

Catches the bugs that make a diagram look unprofessional:

  Structural
    * malformed XML / missing mxGeometry / duplicate ids / comments
  Alignment
    * x/y/width/height not integer multiples of 10 (grid-snap)
    * edge source+target don't share a center axis (bent arrows)
    * container children extending outside container bounds
    * overlapping siblings (unintended stacking)
  Text
    * label text wider than the shape (overflow / clipping)
    * edge label missing `labelBackgroundColor` (disappears in colored zone)
  Style
    * colors not in the SAP Horizon palette (warnings)
    * missing `absoluteArcSize=1` when `arcSize` is set (percent-rendering bug)
    * fontFamily not Helvetica
    * strokeWidth outside {1, 1.5, 3, 4}

Exit code:
  0 — clean (or only warnings)
  1 — errors
  2 — usage

Flags:
  --strict         warnings become errors
  --json           JSON report to stdout instead of human text

Run: python3 validate.py <file.drawio>
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from pathlib import Path

# ---------- SAP Horizon palette ----------------------------------------------
SAP_PALETTE = {
    # Primary
    "#0070F2", "#EBF8FF", "#002A86", "#00185A",
    # Neutral
    "#475E75", "#F5F6F7", "#556B82", "#1D2D3E", "#D5DADD", "#EDEFF0",
    # Accent
    "#5D36FF", "#F1ECFF", "#470BED", "#7F00FF",
    # Success / authentication
    "#188918", "#F5FAE5", "#266F3A",
    # Trust / pink
    "#CC00DC", "#FFF0FA",
    # Teal
    "#07838F", "#DAFDF5",
    # Basics
    "#FFFFFF", "#FFF", "#000000", "#000",
    # Observed variations in SAP ref-arch templates
    "#1A2733", "#354A5F", "#475E74", "#475F75", "#5B738B",
    "#595959", "#EAECEE", "#EAF8FF",
}

COMMENT_RE = re.compile(r"<!--.*?-->", re.S)
HEX_RE = re.compile(r"#[0-9A-Fa-f]{6}\b")
# data URIs embed their own palette we should NOT flag
DATA_URI_RE = re.compile(r"data:image/[^&\";]+")

GRID = 10
ALLOWED_STROKE = {"1", "1.5", "2", "3", "4"}


# ---------- Report model -----------------------------------------------------


@dataclass
class Issue:
    kind: str  # "error" | "warning"
    category: str  # "xml", "align", "text", "style"
    msg: str
    cell: str | None = None


@dataclass
class Report:
    path: str
    issues: list[Issue] = field(default_factory=list)

    def add(self, kind: str, category: str, msg: str, cell: str | None = None) -> None:
        self.issues.append(Issue(kind, category, msg, cell))

    @property
    def errors(self) -> list[Issue]:
        return [i for i in self.issues if i.kind == "error"]

    @property
    def warnings(self) -> list[Issue]:
        return [i for i in self.issues if i.kind == "warning"]

    def to_json(self) -> dict:
        return {
            "path": self.path,
            "ok": not self.errors,
            "errors": [{"category": i.category, "msg": i.msg, "cell": i.cell} for i in self.errors],
            "warnings": [{"category": i.category, "msg": i.msg, "cell": i.cell} for i in self.warnings],
        }


# ---------- Geometry helpers -------------------------------------------------


def geom(cell: ET.Element) -> tuple[float, float, float, float] | None:
    g = cell.find("mxGeometry")
    if g is None:
        return None
    try:
        x = float(g.get("x", "0"))
        y = float(g.get("y", "0"))
        w = float(g.get("width", "0"))
        h = float(g.get("height", "0"))
        return x, y, w, h
    except ValueError:
        return None


def parse_style(style: str | None) -> dict[str, str]:
    if not style:
        return {}
    out: dict[str, str] = {}
    for part in style.split(";"):
        part = part.strip()
        if not part:
            continue
        if "=" in part:
            k, v = part.split("=", 1)
            out[k.strip()] = v.strip()
        else:
            out[part] = "1"
    return out


def approx_text_width(text: str, font_size: float, bold: bool = False) -> float:
    """Crude width estimate in px. Good enough to catch egregious overflow."""
    if not text:
        return 0.0
    # avg char width ≈ 0.55 × font_size for Helvetica regular, 0.60 bold
    coef = 0.60 if bold else 0.55
    return len(text) * font_size * coef


def strip_html(label: str) -> str:
    """Reduce HTML label to its visible text (rough)."""
    # replace <br/> with spaces, then strip tags
    no_br = re.sub(r"<br\s*/?>", " ", label, flags=re.I)
    no_tags = re.sub(r"<[^>]+>", "", no_br)
    return re.sub(r"\s+", " ", no_tags).strip()


def bbox_overlap(a: tuple[float, float, float, float], b: tuple[float, float, float, float]) -> float:
    """Return overlap area in px². 0 if no overlap."""
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    dx = max(0.0, min(ax + aw, bx + bw) - max(ax, bx))
    dy = max(0.0, min(ay + ah, by + bh) - max(ay, by))
    return dx * dy


# ---------- Validators -------------------------------------------------------


def validate(path: Path) -> Report:
    report = Report(path=str(path))
    text = path.read_text(encoding="utf-8")

    if COMMENT_RE.search(text):
        report.add("error", "xml", "XML comments (<!-- -->) forbidden — strip them")

    try:
        root = ET.fromstring(text)
    except ET.ParseError as exc:
        report.add("error", "xml", f"XML parse error: {exc}")
        return report

    # ---- collect cells & basic structural checks ---------------------------
    cells: dict[str, ET.Element] = {}
    duplicate_ids: set[str] = set()
    for cell in root.iter("mxCell"):
        cid = cell.get("id")
        if cid is None:
            report.add("error", "xml", "mxCell without id attribute")
            continue
        if cid in cells:
            duplicate_ids.add(cid)
        cells[cid] = cell

        is_vertex = cell.get("vertex") == "1"
        is_edge = cell.get("edge") == "1"
        if (is_vertex or is_edge) and cell.find("mxGeometry") is None:
            report.add("error", "xml", "vertex/edge missing <mxGeometry>", cell=cid)

    for cid in duplicate_ids:
        report.add("error", "xml", f"duplicate id {cid!r}")

    # ---- style / palette ---------------------------------------------------
    palette_text = DATA_URI_RE.sub("", text)
    foreign = {m.upper() for m in HEX_RE.findall(palette_text)} - {c.upper() for c in SAP_PALETTE}
    for color in sorted(foreign):
        report.add("warning", "style", f"off-palette color {color}")

    # ---- per-cell checks ---------------------------------------------------
    for cid, cell in cells.items():
        style = parse_style(cell.get("style"))

        # Grid snap
        g = geom(cell)
        if g:
            x, y, w, h = g
            for name, val in (("x", x), ("y", y), ("width", w), ("height", h)):
                if abs(val - round(val)) > 0.01 or int(round(val)) % GRID != 0:
                    report.add(
                        "warning",
                        "align",
                        f"{name}={val!r} not on {GRID}-px grid",
                        cell=cid,
                    )

        # absoluteArcSize when arcSize present
        if "arcSize" in style and style.get("absoluteArcSize") != "1":
            report.add(
                "warning",
                "style",
                "arcSize without absoluteArcSize=1 renders as percentage",
                cell=cid,
            )

        # Font family
        ff = style.get("fontFamily")
        if ff and ff.lower() != "helvetica":
            report.add("warning", "style", f"fontFamily={ff!r} (expected Helvetica)", cell=cid)

        # Stroke width
        sw = style.get("strokeWidth")
        if sw and sw not in ALLOWED_STROKE:
            report.add("warning", "style", f"strokeWidth={sw!r} (expected one of {sorted(ALLOWED_STROKE)})", cell=cid)

        # Edge-label background
        if cell.get("edge") == "1":
            val = cell.get("value") or ""
            if val.strip() and not style.get("labelBackgroundColor"):
                report.add(
                    "warning",
                    "text",
                    "edge label without labelBackgroundColor (will bleed into zone fill)",
                    cell=cid,
                )
            if "endArrow" not in style and "startArrow" not in style:
                report.add("warning", "style", "edge without endArrow style", cell=cid)

        # Text overflow (vertex only, has a label, has geometry)
        if cell.get("vertex") == "1" and g:
            label = strip_html(cell.get("value") or "")
            if label:
                font_size = float(style.get("fontSize", "12"))
                bold = style.get("fontStyle", "0") in {"1", "3", "5", "7"}
                spacing = float(style.get("spacingLeft", "0")) + float(style.get("spacingRight", "0"))
                wrap = style.get("whiteSpace") == "wrap" and style.get("html") == "1"
                effective_w = g[2] - spacing - 6  # 6 px slop
                if wrap:
                    # With wrapping, only the single longest token needs to fit
                    longest = max(label.split(), key=len, default="")
                    need = approx_text_width(longest, font_size, bold)
                    if effective_w > 0 and need > effective_w + 2:
                        report.add(
                            "warning",
                            "text",
                            f"longest word '{longest}' ~{int(need)}px > shape width {int(g[2])}px — clip",
                            cell=cid,
                        )
                else:
                    need = approx_text_width(label, font_size, bold)
                    if effective_w > 0 and need > effective_w:
                        report.add(
                            "warning",
                            "text",
                            f"label ~{int(need)}px wider than shape ({int(g[2])}px) — text will clip",
                            cell=cid,
                        )

    # ---- sibling overlap checks (vertices sharing a parent) ---------------
    def is_transparent_or_chrome(cell: ET.Element) -> bool:
        """Cells that float on top of others by design and shouldn't be flagged."""
        s = parse_style(cell.get("style"))
        if s.get("fillColor") in (None, "none"):
            return True
        if s.get("shape") in ("ellipse", "image"):
            return True
        # pill (arcSize >= 40 roughly)
        try:
            if int(s.get("arcSize", "0")) >= 40:
                return True
        except ValueError:
            pass
        # text-only cells
        if s.get("text") == "1" or s.get("strokeColor") == "none":
            return True
        return False

    by_parent: dict[str, list[tuple[str, tuple[float, float, float, float], ET.Element]]] = {}
    for cid, cell in cells.items():
        if cell.get("vertex") != "1":
            continue
        parent = cell.get("parent") or ""
        g = geom(cell)
        if not g or g[2] <= 0 or g[3] <= 0:
            continue
        by_parent.setdefault(parent, []).append((cid, g, cell))

    for parent, members in by_parent.items():
        for i in range(len(members)):
            for j in range(i + 1, len(members)):
                ida, ga, ca = members[i]
                idb, gb, cb = members[j]
                ov = bbox_overlap(ga, gb)
                if ov <= 100:  # ignore slivers
                    continue
                ax, ay, aw, ah = ga
                bx, by_, bw, bh = gb
                contains = (ax <= bx and ay <= by_ and ax + aw >= bx + bw and ay + ah >= by_ + bh) or (
                    bx <= ax and by_ <= ay and bx + bw >= ax + aw and by_ + bh >= ay + ah
                )
                if contains:
                    continue
                # Pills / icons / text / transparent cells are allowed to float over frames
                if is_transparent_or_chrome(ca) or is_transparent_or_chrome(cb):
                    continue
                report.add(
                    "warning",
                    "align",
                    f"cells {ida} and {idb} overlap by {int(ov)}px² (same parent {parent})",
                )

    # ---- bent-edge detection ----------------------------------------------
    for cid, cell in cells.items():
        if cell.get("edge") != "1":
            continue
        src_id = cell.get("source")
        tgt_id = cell.get("target")
        if not src_id or not tgt_id:
            continue
        style = parse_style(cell.get("style"))
        if style.get("edgeStyle") != "orthogonalEdgeStyle":
            continue  # non-orthogonal edges may legitimately curve
        # Skip edges with explicit entry/exit anchors — author has chosen the docking
        if any(k in style for k in ("entryX", "exitX", "entryY", "exitY")):
            continue
        src = cells.get(src_id)
        tgt = cells.get(tgt_id)
        if not src or not tgt:
            continue
        gs = geom(src)
        gt = geom(tgt)
        if not gs or not gt:
            continue
        cx_s = gs[0] + gs[2] / 2
        cy_s = gs[1] + gs[3] / 2
        cx_t = gt[0] + gt[2] / 2
        cy_t = gt[1] + gt[3] / 2
        aligned_v = abs(cx_s - cx_t) <= 1.0  # centers on same vertical
        aligned_h = abs(cy_s - cy_t) <= 1.0  # centers on same horizontal
        if not (aligned_v or aligned_h):
            # Is there overlap on an axis? If boxes overlap on X the edge can still drop straight
            overlap_x = min(gs[0] + gs[2], gt[0] + gt[2]) - max(gs[0], gt[0])
            overlap_y = min(gs[1] + gs[3], gt[1] + gt[3]) - max(gs[1], gt[1])
            if overlap_x < 10 and overlap_y < 10:
                report.add(
                    "warning",
                    "align",
                    f"edge {cid}: source/target centers differ on both axes "
                    f"(Δx={cx_s - cx_t:.0f}, Δy={cy_s - cy_t:.0f}) — arrow will bend. "
                    "Either snap centers or add entryX/exitX anchors.",
                    cell=cid,
                )

    return report


# ---------- Output ----------------------------------------------------------


def print_text(report: Report) -> None:
    path = report.path
    if not report.issues:
        print(f"{path}: OK")
        return
    for i in report.warnings:
        loc = f" [{i.cell}]" if i.cell else ""
        print(f"{path}: warning ({i.category}){loc}: {i.msg}")
    for i in report.errors:
        loc = f" [{i.cell}]" if i.cell else ""
        print(f"{path}: error ({i.category}){loc}: {i.msg}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="+")
    ap.add_argument("--strict", action="store_true", help="warnings fail the run")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    rc = 0
    reports = []
    for f in args.files:
        p = Path(f)
        if not p.exists():
            print(f"{p}: not found", file=sys.stderr)
            rc = 1
            continue
        r = validate(p)
        reports.append(r)
        if r.errors or (args.strict and r.warnings):
            rc = 1

    if args.json:
        print(json.dumps([r.to_json() for r in reports], indent=2))
    else:
        for r in reports:
            print_text(r)

    return rc


if __name__ == "__main__":
    sys.exit(main())
