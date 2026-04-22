# Shape & edge conventions

All values match the SAP Architecture Center reference templates. Copy the style strings verbatim — do not invent alternatives.

## Zone frame (outer landscape containers)

Always has an **inline top-left bold label** — never a separate header tab.

```
rounded=1;whiteSpace=wrap;html=1;arcSize=16;absoluteArcSize=1;strokeWidth=1.5;
fontFamily=Helvetica;align=left;verticalAlign=top;spacingLeft=10;spacingTop=10;
fontSize=16;fontStyle=1;
```

`arcSize=16;absoluteArcSize=1` produces a fixed 16-px corner radius — this is the SAP house spec. Without `absoluteArcSize=1`, draw.io treats `16` as a percentage and the corners look huge on wide zones. **`autofix.py` adds `absoluteArcSize=1` automatically, but your source should have it from the start.**

L0 hero cards use `arcSize=32` instead of 16 — those are the only exceptions.

## Service card (tile inside a zone)

```
rounded=1;whiteSpace=wrap;html=1;arcSize=16;absoluteArcSize=1;strokeWidth=1.5;
fontFamily=Helvetica;fontSize=12;align=center;verticalAlign=middle;
```

Card content is HTML in the `value` attribute — **bold title 13 px** then `<br/>` then **muted caption 11 px** wrapped in `<span style="font-size:11px;color:#556B82;font-weight:normal;">…</span>`. Typical size: **280 × 50–84 px**.

### Icon + label pattern

For a BTP service tile with the official icon + a label underneath, use the pre-built mxCell from the bundled library (see `extract_icon.py`). The library cells already set:

- `shape=image;image=data:image/svg+xml,<base64>`
- `verticalLabelPosition=bottom;verticalAlign=top` — puts the label below the icon
- `labelPosition=center;align=center`
- `imageAspect=0;aspect=fixed`

Default size **64 × 80** (icon 64 px + ~16 px for the label). Set `fontSize=12` on the icon cell for the label — larger than the ref default 10 so short labels don't look stranded.

## Action pill (edge pill — HTTPS, TRUST, Sign-in, mTLS, A2A, MCP, authorization)

```
rounded=1;whiteSpace=wrap;html=1;arcSize=50;absoluteArcSize=1;strokeWidth=1;
fontFamily=Helvetica;fontSize=10;align=center;verticalAlign=middle;
```

- **Size**: 60–90 × 20–24 px
- **Label**: `<b style="font-size:10px;">LABEL</b>` — short, imperative, UPPERCASE for trust relationships
- **Color per role** — see `palette-and-typography.md` (green = authentication, magenta = trust, teal = MCP, indigo = authorization)

Pills **float on top** of zone frames — they share `parent="1"` with the zones, not the zone as parent. The validator suppresses overlap warnings for them.

## Numbered flow step (L2 flow narration)

Small coloured circle (`shape=ellipse;aspect=fixed`), ~28-35 px diameter, with a single-digit bold label. Color matches the semantic category (green = auth step, indigo = authz step, magenta = trust step, neutral `#475E75` = plain flow step).

## Edge defaults

```
edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;
strokeColor=#475E75;strokeWidth=1.5;
endArrow=blockThin;endSize=6;endFill=1;
fontFamily=Helvetica;fontSize=10;
labelBackgroundColor=default;
```

**`labelBackgroundColor=default` is mandatory** for any edge that crosses a filled zone. Without it, edge label text bleeds into the `#EBF8FF` BTP fill and becomes unreadable — the single most common "looks unpolished" bug.

### Edge color semantics

| Color | Meaning |
|-------|---------|
| `#475E75` | Default internal flow |
| `#188918` | Authenticated HTTPS channel |
| `#002A86` | Call into SAP ABAP system (ADT) |
| `#CC00DC` dashed | Trust relationship (no data) |
| `#000000` solid thick (`strokeWidth=3` or `4`) | Network / firewall barrier |

### Trust lines

Use `dashed=1;dashPattern=4 4` and `startArrow=none;endArrow=none` if the trust is bidirectional. Trust lines carry no data — never give them a pill.

## Alignment rule (highest-leverage polish trick)

For an `orthogonalEdgeStyle` edge with `source=A; target=B` to render as a **straight line** (no bend), the **centers** of A and B must share an axis:

- `A.centerX == B.centerX` → vertical straight line
- `A.centerY == B.centerY` → horizontal straight line

Where `centerX = x + width/2`, `centerY = y + height/2`.

If the centers differ on both axes, the edge renders with a 90° kink. Either:

1. Snap one coordinate so the centers align (preferred), **or**
2. Add explicit docking anchors: `entryX=0.5;entryY=0;exitX=0.5;exitY=1;entryDx=0;entryDy=0;exitDx=0;exitDy=0`.

`validate.py` detects this class of bug and reports `edge N: source/target centers differ on both axes`.

## Gotchas

- **Widths like `239.99999999999997`** happen because draw.io UI rounds imprecisely — emit integers. `autofix.py` quantises them.
- **`absoluteArcSize=1` is non-negotiable** — without it, `arcSize=16` on a 800-px zone makes an 800×0.16 = 128-px radius, which is way too round.
- **Pill `strokeWidth` is `1`, not `1.5`** — pills are small and 1.5 looks over-weighted.
- **Edge labels need `labelBackgroundColor=default`** even when the edge is outside a zone, for consistency.
- **Service-card labels are set on the icon cell**, not the wrapping rectangle. Naive generators put the label on the rectangle and the text gets clipped by the icon image.
