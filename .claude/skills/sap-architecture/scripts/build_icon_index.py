#!/usr/bin/env python3
"""Parse assets/libraries/btp-service-icons-all-size-M.xml and emit icon-index.json.

Run once (or whenever the upstream icon library is refreshed).

Output: assets/icon-index.json with
  {
    "<slug>": {
      "label": "<exact library label as-is, with whitespace>",
      "aliases": ["<normalized alias>", ...],
      "style": "<ready-to-paste mxCell style attribute value>"
    }
  }

No image payload is inlined (the library XML already holds them); the extract
script (extract_icon.py) returns the full image-data URI on demand.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from xml.sax.saxutils import unescape

HERE = Path(__file__).resolve().parent
LIB = HERE.parent / "assets" / "libraries" / "btp-service-icons-all-size-M.xml"
OUT = HERE.parent / "assets" / "icon-index.json"


def clean(label: str) -> str:
    label = label.replace("&amp;#10;", " ").replace("\\n", " ")
    label = re.sub(r"\s+", " ", label).strip()
    return label


def slugify(name: str) -> str:
    s = name.lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def build() -> dict[str, dict]:
    raw = LIB.read_text(encoding="utf-8")
    # strip the <mxlibrary>...</mxlibrary> shell and the stray comments
    raw = re.sub(r"<!--.*?-->", "", raw, flags=re.S)
    raw = raw.strip()
    assert raw.startswith("<mxlibrary>") and raw.endswith("</mxlibrary>"), raw[:80]
    body = raw[len("<mxlibrary>") : -len("</mxlibrary>")].strip()
    entries = json.loads(body)

    index: dict[str, dict] = {}
    for entry in entries:
        xml_encoded = entry["xml"]
        xml = unescape(xml_encoded)
        # find the <mxCell ... value="..." style="..." ...>
        cell = re.search(r'<mxCell[^>]*value="([^"]*)"[^>]*style="([^"]*)"', xml)
        if not cell:
            continue
        raw_label = cell.group(1)
        style = cell.group(2)
        label = clean(raw_label)
        slug = slugify(label)
        if not slug:
            continue

        aliases = {slug}
        # common abbreviations / renamings people use when describing diagrams
        noise = ["sap-", "service-for-sap-btp", "-service", "-on-sap-btp"]
        short = slug
        for n in noise:
            short = short.replace(n, "-")
        short = re.sub(r"-+", "-", short).strip("-")
        if short and short != slug:
            aliases.add(short)
        # word-only alias (drops "-service" tails)
        aliases.add(re.sub(r"-service$", "", slug))

        index[slug] = {
            "label": raw_label,
            "display": label,
            "aliases": sorted(aliases - {slug}),
            "style": style,
        }
    return index


def main() -> int:
    if not LIB.exists():
        print(f"missing {LIB}", file=sys.stderr)
        return 1
    index = build()
    OUT.write_text(json.dumps(index, indent=2, ensure_ascii=False, sort_keys=True) + "\n", encoding="utf-8")
    print(f"wrote {OUT} — {len(index)} icons")
    return 0


if __name__ == "__main__":
    sys.exit(main())
