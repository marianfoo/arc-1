# SAP Architecture Center style reference

Load this file when the user asks for a diagram involving SAP, SAP BTP, Cloud Foundry, Kyma, subaccount, Fiori, S/4HANA, Cloud Connector, or anything styled like the SAP Architecture Center at https://architecture.learning.sap.com .

Every value here was extracted from pristine SAP Architecture Center templates. Encode them directly — do not improvise.

## Workflow: copy-and-edit a pristine reference

**Never draw from scratch.** Start from one of the bundled reference `.drawio` files under `assets/reference-examples/`:

| File | Best for |
|------|----------|
| `SAP_Cloud_Identity_Services_Authentication_L2.drawio` | Identity / OAuth / trust / sign-in flows (IAS ↔ XSUAA, SSO) |
| `SAP_Private_Link_Service_L2.drawio` | Subaccount → hyperscaler private network, destination + connectivity |
| `SAP_Task_Center_L2.drawio` | BTP service consuming multiple backend systems via Destination Service |

Steps:

1. Copy the closest reference into the target location (e.g. `cp assets/reference-examples/SAP_Task_Center_L2.drawio docs/my-diagram.drawio`).
2. Open the file and **keep** the title band, zone containers, legend, SAP logo cell, and canvas size. These are already aligned to the canonical style.
3. **Rename** the diagram (`<diagram name="…">`) and the title cell value.
4. Delete the example's inner service cards, edges, and pills. Keep one of each as a styling template.
5. Drop in new cards, edges, and pills by duplicating the templates you kept. Reuse their `style="…"` strings verbatim — never retype the palette.
6. Keep every `mxCell` id unique (search/replace the reference's prefix with a new one).

## Icon library: `assets/libraries/btp-service-icons-all-size-M.xml`

100 SAP BTP service icons shipped as a drawio library (`<mxlibrary>[…]</mxlibrary>`, each entry an XML-encoded `mxCell` with `shape=image;image=data:image/svg+xml,<base64>`).

### Looking up an icon

```bash
grep -oE 'value=\\"[^\\]+\\"' .claude/skills/drawio/assets/libraries/btp-service-icons-all-size-M.xml \
  | sed 's/value=\\"//; s/\\"$//; s/&amp;#10;/ /g' | sort -u
```

To grab the full `mxCell` for a specific service (example: SAP Destination service):

```bash
python3 -c '
import json, re, sys
raw = open(".claude/skills/drawio/assets/libraries/btp-service-icons-all-size-M.xml").read()
raw = re.sub(r"<!--.*?-->", "", raw, flags=re.S)
raw = raw.strip()[len("<mxlibrary>"):-len("</mxlibrary>")]
for entry in json.loads(raw):
    if "SAP Destination" in entry["xml"]:
        print(entry["xml"]); break'
```

The returned string is already XML-encoded. Unescape it (`&lt;` → `<`, `&quot;` → `"`), then splice the `mxCell`'s `style="…"` and the embedded `image=data:image/svg+xml,<base64>` value into your diagram.

### Common services (service name → canonical library label)

| Service | Library label |
|---------|---------------|
| Destination Service | `SAP Destination service` |
| Connectivity Service | `SAP Connectivity Service` |
| XSUAA / Authorization & Trust | `SAP Authorization  and  Trust Management service` |
| Audit Log Service | `SAP Audit Log Service` |
| Cloud Foundry runtime | `SAP BTP, Cloud Foundry runtime` |
| Kyma runtime | `SAP BTP, Kyma runtime` |
| Cloud Connector | `Cloud  Connector` |
| Application Logging | `SAP Application Logging service for SAP BTP` |
| Cloud Identity Services / IAS | `Identity Authentication` or `SAP Cloud Identity Service` |
| HANA Cloud | `SAP HANA Cloud` |
| Task Center | `SAP Task Center` |
| Object Store | `Object Store on SAP BTP` |
| BTP ABAP environment | `SAP BTP ABAP environment` |

Note the double spaces and trailing spaces in some labels — they come from the upstream library verbatim.

### Fallback: inline SVG from a reference .drawio

If the library doesn't contain the icon you need, extract an inline `image=data:image/svg+xml,<base64>…` value from one of the reference `.drawio` files. Do **not** use `shape=mxgraph.sap.icon;SAPIcon=<Name>` stencils — they render as blank frames in many installations.

The SAP brand mark is the only exception: `image=img/lib/sap/SAP_Logo.svg` is bundled with draw.io and reliable.

## Diagram level taxonomy (L0–L3)

SAP Architecture Center publishes four diagram levels. Each has its own visual density. Name the `<diagram name="…">` tab accordingly so users can recognise the level at a glance.

| Level | Audience | Content | Canvas |
|-------|----------|---------|--------|
| **L0 / Marketecture** | Executives | One concept per box. No technical detail. Logos + arrows. | 1169×827 |
| **L1 / Conceptual** | Architects | Named services, trust zones, no protocol detail. | 1169×827 |
| **L2 / Logical** | Lead devs | Services, accounts, roles, protocols, trust/flow pills. (Most common level — default here.) | 1169×827 or 1654×1169 |
| **L3 / Physical** | Platform / SRE | Hostnames, subnets, certificates, specific HTTP routes. | 1654×1169 |

When in doubt pick **L2** — it's the native level of the SAP reference examples.

## Canvas & page size

| Situation | `pageWidth` × `pageHeight` |
|-----------|---------------------------|
| L0 / L1 / single-zone L2 | `1169 × 827` (matches all bundled reference examples) |
| Rich L2 with 3+ zones + bound services + legend | `1654 × 1169` |
| L3 | `1654 × 1169` or larger |

Grid = 10 px. Snap everything. `grid="0"` in the reference files hides the grid at render time but the 10-px alignment is still assumed.

## Palette (single family — never mix in generic pastels)

| Role | Stroke | Fill | Text |
|------|--------|------|------|
| Primary SAP blue frames (BTP, subaccount outer) | `#0070F2` | `#EBF8FF` | `#002A86` |
| White service card inside BTP zone | `#0070F2` | `#FFFFFF` | `#00185A` |
| Light-blue tile (bound services, inner cards) | `#0070F2` | `#EBF8FF` | `#00185A` |
| Neutral frame (MCP client, inner Subaccount) | `#475E75` | `#FFFFFF` | `#475E75` (label), `#00185A` (content) |
| On-Premise / 3rd Party frame | `#475E75` | `#F5F6F7` | `#475E75` |
| SAP ABAP system card (focus target) | `#002A86` | `#FFFFFF` | `#00185A` |
| Accent (focus app: the "star" — e.g. ARC-1, Joule) | `#5D36FF` | `#F1ECFF` | `#00185A` |
| Success pill (HTTPS, TRUST, Sign-in, mTLS) | `#188918` | `#F5FAE5` | `#266F3A` |
| Magenta pill (A2A, bind) | `#CC00DC` | `#FFF0FA` | `#CC00DC` |
| Teal pill (MCP) | `#07838F` | `#DAFDF5` | `#07838F` |
| Default connector stroke (internal) | `#475E75` | — | `#475E75` |
| Authenticated connector stroke | `#188918` | — | `#266F3A` |
| ADT / SAP ABAP connector stroke | `#002A86` | — | `#002A86` |
| Muted caption text | — | — | `#556B82` |

## Typography (Helvetica everywhere)

| Role | Size | Weight | Color |
|------|------|--------|-------|
| Diagram title | 24 | bold | `#002A86` |
| Subtitle | 14 | regular | `#475E75` |
| Zone/container label (Subaccount, On-Premise, MCP Client) | 16 | bold | `#475E75` or `#00185A` |
| Sub-section label (Bound BTP Services) | 14 | bold | `#00185A` |
| Card title | 13–14 | bold | `#00185A` |
| Card caption / inline helper | 11 | regular | `#556B82` |
| Pill label | 10 | bold (uppercase for TRUST, Sign-in) | pill text color |
| Edge label (non-pill) | 10 | regular | `#475E75` or zone color |
| Inline section divider ("ROLE COLLECTIONS", "ENFORCEMENT") | 11 | bold, UPPERCASE | accent color |

## Shape defaults

**Container frame** (zone — always with inline top-left bold label, never a separate header tab). Note: SAP ref-arch templates use `arcSize=16`; the earlier Joule template used `arcSize=24`. Prefer `16` for new diagrams.

```
rounded=1;whiteSpace=wrap;html=1;arcSize=16;absoluteArcSize=1;strokeWidth=1.5;
fontFamily=Helvetica;align=left;verticalAlign=top;spacingLeft=10;spacingTop=6;
fontSize=16;fontStyle=1;
```

**Service card** (tile inside a zone):

```
rounded=1;whiteSpace=wrap;html=1;arcSize=16;absoluteArcSize=1;strokeWidth=1.5;
fontFamily=Helvetica;fontSize=12;align=center;verticalAlign=middle;
```

Card content uses HTML: bold title 13px + `<br/>` + muted caption 11px wrapped in `<span style="font-size:11px;color:#556B82;font-weight:normal;">…</span>`. Typical size: **280 × 50–84 px**.

**Action pill** (on edges — HTTPS, TRUST, Sign-in, mTLS, A2A, MCP):

```
rounded=1;whiteSpace=wrap;html=1;arcSize=50;absoluteArcSize=1;strokeWidth=1.2;
fontFamily=Helvetica;fontSize=10;align=center;verticalAlign=middle;
```

Typical size: **60–90 × 20–24 px**. Label is `<b style="font-size:10px;">LABEL</b>`. Short, imperative, often UPPERCASE for trust relationships.

**Edge defaults**:

```
edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;
strokeColor=#475E75;strokeWidth=1.5;
endArrow=blockThin;endSize=6;endFill=1;
fontFamily=Helvetica;fontSize=10;
```

Use `strokeColor=#188918` (green) for authenticated / trusted channels. Use `strokeColor=#002A86` (deep blue) for calls into the SAP ABAP system. Use `dashed=1;dashPattern=4 4` for trust relationships (no data on the wire) — with `startArrow=none;endArrow=none` if bidirectional.

**Edge labels not on pills**: keep them tiny and readable by setting `fillColor=<zone-background>` so the text punches through the edge. Labels crossing the BTP zone use `fillColor=#EBF8FF`, labels over white use `fillColor=#FFFFFF`, labels over on-prem gray use `fillColor=#F5F6F7`.

## Layout idiom (mandatory for BTP-style diagrams)

1. **Canvas**: start from a reference-example's canvas size (see table above). Grid = 10 px. Snap everything.
2. **Title band** — full-width centered `text` cell at `y=30`, 24 pt bold `#002A86`. Subtitle immediately below at `y=68`, 14 pt `#475E75`.
3. **Three-zone horizontal layout** at `y≥130`:
   - **MCP Client / User zone** (far left): `x≈60, width≈260`, neutral white frame `#475E75` stroke.
   - **BTP zone** (center): `x≈360, width≈840`, `#0070F2` stroke on `#EBF8FF` fill. SAP logo header (`image=img/lib/sap/SAP_Logo.svg`) top-left at `x=zone+18, y=zone+15, w=45, h=23`. Contains an inner white **Subaccount** frame.
   - **On-Premise zone** (far right): `x≈1280, width≈320`, `#475E75` stroke on `#F5F6F7` fill.
4. **Network divider** between BTP and On-Premise: a **solid 4 px vertical line** (not a dashed box) — `<mxCell edge="1" style="endArrow=none;strokeColor=#475E75;strokeWidth=4;">`. Add a rotated "Network" text label on white background next to it (fontSize=12 bold, `rotation=-90`).
5. **Focus app card** (ARC-1, Joule, etc.) — use the accent palette (`#5D36FF`/`#F1ECFF`). Size generously (e.g. 400×320). Inside, structure as: bold title + caption, then stacked sub-sections separated by **inline uppercase dividers** in accent color ("ROLE COLLECTIONS", "ENFORCEMENT"), each followed by a row of pill-chips or sub-cards.
6. **Bound services** go in a separate white frame inside the BTP zone, stacked vertically as light-blue tiles (`#EBF8FF` fill, `#0070F2` stroke). Prefer icons from the bundled library (`btp-service-icons-all-size-M.xml`) over plain rectangles — they carry the canonical SAP visual grammar.
7. **Edge pills** live mid-edge — use the success-green pill for any authenticated HTTPS, trust, sign-in, or mTLS channel. Do not repeat protocol details on every pill; add a single muted caption below (e.g. "HTTPS · Bearer JWT") only where it aids understanding.
8. **Legend** is a **markdown `## Flow` numbered list below the diagram in the host document**, NOT a swatch box inside the canvas. SAP ref-arch pages put the flow narration in prose — the diagram stays clean.

## Visual quality checklist (verify before exporting)

- All fonts are Helvetica, no Arial or default sans-serif
- Zone labels are inline top-left bold, NOT inside a separate header tab
- Service card captions are `#556B82` at 11 pt, not the same weight as titles
- Pills have `arcSize=50` (full round), bold 10 pt label, green `#188918` stroke
- Network column is a **solid 4 px line**, not a dashed rectangle
- Edge labels that cross zone boundaries have `fillColor` matching the zone background so they remain legible
- The focus app uses the purple `#5D36FF`/`#F1ECFF` palette and contains inline uppercase dividers
- Bundled-library icons preferred over improvised rectangles for any BTP service mentioned in the icon list
- Every `mxCell` has a unique `id`
- No XML comments
- `scripts/validate_drawio.py <file>` passes

## Validation

Run `python3 .claude/skills/drawio/scripts/validate_drawio.py <file.drawio>` before reporting a diagram as done. It checks:

- XML well-formedness
- No `<!-- -->` comments
- Unique `mxCell` ids
- Every vertex / edge mxCell has an `mxGeometry` child
- Palette colors belong to the SAP family (warns on foreign hex values)

## Export

Always export SAP diagrams with `-b 10 -s 2` (2× scale, 10 px border) for crisp embedding in MkDocs. The embedded XML lets users re-open the PNG in draw.io and iterate.
