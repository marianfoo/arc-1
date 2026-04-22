#!/usr/bin/env python3
"""Extract a ready-to-paste <mxCell> for a named SAP BTP service icon.

Usage:
  extract_icon.py <service-name> [--x X --y Y --w W --h H --id ID --parent P --label "text"]
  extract_icon.py --list

Search is fuzzy (case-insensitive substring + slug alias).
Emits the <mxCell ...><mxGeometry .../></mxCell> to stdout.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from xml.sax.saxutils import escape

HERE = Path(__file__).resolve().parent
INDEX = HERE.parent / "assets" / "icon-index.json"


def load_index() -> dict:
    if not INDEX.exists():
        print(f"icon index not found at {INDEX}; run build_icon_index.py first", file=sys.stderr)
        sys.exit(1)
    return json.loads(INDEX.read_text(encoding="utf-8"))


def _normalize(text: str) -> str:
    """Strip HTML entities (&#10;, &amp;), lowercase, collapse non-alphanumeric to single spaces."""
    t = text.lower()
    # decode common HTML newline / ampersand entities
    t = re.sub(r"&#?\w+;", " ", t)
    # kill the -10- slug artifact from earlier encoding
    t = re.sub(r"(^|-)10(-|$)", r"\1 \2", t)
    return re.sub(r"[^a-z0-9]+", " ", t).strip()


def _tokens(text: str) -> set[str]:
    return {tok for tok in _normalize(text).split() if tok}


# Hand-curated aliases for common SAP service abbreviations / nicknames.
# These map a user-typed query → a slug substring that uniquely identifies the icon.
COMMON_ALIASES: dict[str, str] = {
    "xsuaa": "sap-authorization-10-and-10-trust-management-service",
    "uaa": "sap-authorization-10-and-10-trust-management-service",
    "auth trust": "sap-authorization-10-and-10-trust-management-service",
    "ias": "identity-10-authentication",
    "ips": "identity-provisioning",
    "btp cockpit": "sap-btp-cockpit",
    "hana": "sap-hana-cloud",
    "hana cloud": "sap-hana-cloud",
    "cf": "cloud-10-foundry-runtime",
    "cloud foundry": "cloud-10-foundry-runtime",
    "cap": "cloud-application-programming",
    "destination": "sap-destination-10-service",
    "cc": "cloud-10-connector",
    "connector": "cloud-10-connector",
    "abap env": "abap-environment",
    "abap environment": "abap-environment",
    "build apps": "sap-build-apps",
    "build process": "sap-build-process-automation",
    "build code": "sap-build-code",
    "joule": "joule-studio",
    "task center": "sap-task-center",
    "cpi": "cloud-10-integration",
    "integration suite": "integration-suite",
}


def find(index: dict, query: str) -> tuple[str, dict] | None:
    q = query.lower().strip()
    qslug = re.sub(r"[^a-z0-9]+", "-", q).strip("-")
    # curated alias table
    if q in COMMON_ALIASES:
        slug = COMMON_ALIASES[q]
        if slug in index:
            return slug, index[slug]
    # exact slug
    if qslug in index:
        return qslug, index[qslug]
    # alias match
    for slug, entry in index.items():
        if qslug in entry["aliases"] or qslug == entry["display"].lower():
            return slug, entry

    qtokens = _tokens(q)
    if not qtokens:
        return None

    # token-subset match: every query token appears in (display | slug | aliases)
    token_candidates: list[tuple[str, dict]] = []
    for slug, entry in index.items():
        pool = _tokens(slug) | _tokens(entry["display"]) | {a for alias in entry["aliases"] for a in _tokens(alias)}
        if qtokens <= pool:
            token_candidates.append((slug, entry))
    if len(token_candidates) == 1:
        return token_candidates[0]
    if len(token_candidates) > 1:
        # prefer the candidate whose normalized display is shortest (tightest match)
        token_candidates.sort(key=lambda se: len(_normalize(se[1]["display"])))
        # if the top candidate is strictly shorter than the runner-up, take it
        top = _normalize(token_candidates[0][1]["display"])
        second = _normalize(token_candidates[1][1]["display"])
        if len(top) < len(second):
            return token_candidates[0]
        print(f"ambiguous '{query}' — {len(token_candidates)} matches:", file=sys.stderr)
        for s, e in token_candidates[:10]:
            print(f"  {s}  —  {e['display']}", file=sys.stderr)
        sys.exit(2)

    # substring fallback
    candidates = [(s, e) for s, e in index.items() if q in e["display"].lower() or qslug in s]
    if len(candidates) == 1:
        return candidates[0]
    if len(candidates) > 1:
        print(f"ambiguous '{query}' — {len(candidates)} matches:", file=sys.stderr)
        for s, e in candidates[:10]:
            print(f"  {s}  —  {e['display']}", file=sys.stderr)
        sys.exit(2)
    return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("query", nargs="?")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--x", type=int, default=0)
    ap.add_argument("--y", type=int, default=0)
    ap.add_argument("--w", type=int, default=64)
    ap.add_argument("--h", type=int, default=80)
    ap.add_argument("--id", default="icon1")
    ap.add_argument("--parent", default="1")
    ap.add_argument("--label", default=None, help="Override icon label text")
    args = ap.parse_args()

    index = load_index()
    if args.list:
        for slug in sorted(index):
            print(f"{slug:60s}  {index[slug]['display']}")
        return 0
    if not args.query:
        ap.print_usage(sys.stderr)
        return 2

    match = find(index, args.query)
    if not match:
        print(f"no icon matches '{args.query}'", file=sys.stderr)
        return 1
    slug, entry = match

    style = entry["style"]
    label = args.label if args.label is not None else entry["label"]
    label_xml = escape(label, {'"': "&quot;"})

    # Snap to 10-px grid (quiet fix)
    x = round(args.x / 10) * 10
    y = round(args.y / 10) * 10
    w = round(args.w / 10) * 10
    h = round(args.h / 10) * 10

    cell = (
        f'<mxCell id="{args.id}" value="{label_xml}" style="{style}" '
        f'vertex="1" parent="{args.parent}">'
        f'<mxGeometry x="{x}" y="{y}" width="{w}" height="{h}" as="geometry"/>'
        f"</mxCell>"
    )
    print(cell)
    print(f"# matched: {slug} — {entry['display']}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
