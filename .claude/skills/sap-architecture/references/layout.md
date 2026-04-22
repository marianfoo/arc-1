# Canvas layout recipe

Every SAP Architecture Center reference L2 diagram sits on a **1169 × 827** canvas with the same coarse skeleton. Start from it, don't reinvent.

## Coordinate grid

All placements below are snapped to the **10-px grid**. If you need to nudge something off-grid to make connector centers align, prefer moving by 10 at a time and keep the numbers integer.

```
 ┌──────────────────────────────────────────────────────────────────────────┐
 │  Title (24pt bold #002A86, left-anchored)           y=30..60             │
 │  Subtitle (14pt #475E75)                            y=70..95             │
 ├─────────────┬────────────────────────────────────┬───────────────────────┤
 │ User zone   │           SAP BTP zone             │  On-Premise zone      │
 │ x≈40..250   │           x≈270..880               │  x≈910..1140          │
 │ w=210       │           w=610                    │  w=230                │
 │ stroke      │   stroke #0070F2 fill #EBF8FF      │   stroke #475E75      │
 │ #475E75     │                                    │   fill #F5F6F7        │
 │ fill white  │                                    │                       │
 │             │                                    │                       │
 │             │                                    │                       │
 │  (y≈130..700 working area)                                               │
 └──────────────────────────────────────────────────────────────────────────┘
                                                             network bar
                                                             solid 4 px
                                                             at x=890..895
```

The network bar is a **single solid 4-px vertical line** between BTP and On-Prem (`strokeColor=#475E75;strokeWidth=4;endArrow=none`) — not a dashed rectangle. Next to it, a rotated text label `"Network"` (`rotation=-90;fontSize=12;fontStyle=1`) on white background.

## Zone-specific rules

### User / MCP Client zone (left column)

- `x=40, y=120, width=210, height≈580`
- Inline label `"MCP Client"` top-left, 16 pt bold `#475E75`
- Contains: optional user avatar (icon 64×80) + stacked client cards (VS Code, Claude Desktop, Copilot Studio, …) at 180×50 each, 20-px vertical gap

### SAP BTP zone (center column)

- `x=270, y=120, width=610, height≈580`
- Inline label `"SAP BTP"` top-left, 16 pt bold `#00185A`
- SAP logo (`image=img/lib/sap/SAP_Logo.svg`) top-right of the zone at `x=zone.right-90, y=zone.top+15, w=60, h=23` (or top-left at `x=zone.left+10, y=zone.top+10`)
- Inside: an inner white `Subaccount` frame at `x=300, y=170, width=560, height≈450`, stroke `#475E75`, fill `#FFFFFF`. Inside the Subaccount, stack the focus app card + bound services.
- **Bound services** always go in a separate white frame inside the BTP zone, stacked vertically as light-blue tiles (`#EBF8FF` fill, `#0070F2` stroke). Use the bundled service icons for visual grammar.

### On-Premise zone (right column)

- `x=910, y=120, width=230, height≈580`
- Inline label `"On-Premise"` top-left, 16 pt bold `#475E75`
- Typical content: `Cloud Connector` card + one or more backend system cards (S/4HANA, BW/4HANA, ECC)

## Pills on edges

Pills sit at the **midpoint of each edge**, floating above both zones. They share `parent="1"` with the zones (not a zone as parent) — this is why the validator exempts them from sibling-overlap checks.

Short imperative labels:

- `SIGN-IN` (green) — user auth
- `TRUST` (magenta, uppercase) — trust anchor
- `MCP TOOL CALL` (teal) — MCP JSON-RPC over HTTPS
- `mTLS · PP` (green) — Cloud Connector mutual TLS with Principal Propagation
- `OAUTH · JWT` (green) — XSUAA OAuth bearer

One pill per semantic step. Don't stack two pills on the same edge; break the edge into two steps if needed.

## Title band

```xml
<mxCell id="title-main" value="ARC-1 on SAP BTP Cloud Foundry"
  style="text;html=1;fontFamily=Helvetica;fontSize=24;fontStyle=1;fontColor=#002A86;align=left;verticalAlign=middle;"
  vertex="1" parent="1">
  <mxGeometry x="40" y="30" width="1080" height="40" as="geometry"/>
</mxCell>
<mxCell id="title-sub" value="MCP client → XSUAA OAuth → ARC-1 → Cloud Connector → on-prem SAP"
  style="text;html=1;fontFamily=Helvetica;fontSize=14;fontColor=#475E75;align=left;verticalAlign=middle;"
  vertex="1" parent="1">
  <mxGeometry x="40" y="70" width="1080" height="30" as="geometry"/>
</mxCell>
```

Keep the title under ~60 chars and the subtitle under ~100. Longer strings need wrapping which throws the coordinate math off.

## Legend

**Do not draw a legend inside the canvas.** The SAP ref-arch convention is:

- Edge pills are self-explanatory via color + label
- The flow narration below the embedded PNG (in Markdown / Confluence) spells out what each color means

If the user explicitly asks for an inside-canvas legend, put it at `y≈730`, full-width, a single neutral frame with two rows (lines + blocks).

## Aspect ratio & margins

The 1169 × 827 canvas has a ~1.41 aspect ratio (A4 landscape). Leave:

- **40-px margin** on left and right (content lives at 40..1140)
- **120-px top margin** for title + subtitle
- **~100-px bottom margin** for the legend / whitespace

Zones fill the middle band evenly. Three zones → widths roughly `210 | 610 | 230` adding to 1050 with three 20-px gutters.
