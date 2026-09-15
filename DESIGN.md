---
name: ExpenseHub
description: Yeems Coffee's internal procurement and expense tool
colors:
  myrtle: "#2B4628"
  myrtle-hover: "#243a22"
  myrtle-deep: "#1d2f1b"
  myrtle-pale: "#e1eadd"
  soft-harbor-blue: "#BCD7DE"
  soft-harbor-blue-deep: "#3d6d7a"
  warm-parchment: "#F2ECD4"
  parchment-pale: "#fdfcf8"
  paper: "#ffffff"
  ink: "#241f14"
  ink-soft: "#5c5648"
  ink-faint: "#8a8371"
  hairline: "#e6e2d3"
  ledger-warning: "#d68a1f"
  ledger-error: "#b8503f"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', 'Segoe UI', system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', 'Segoe UI', system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.25
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', 'Segoe UI', system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.25
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', 'Segoe UI', system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', 'Segoe UI', system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "0.04em"
rounded:
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  2xl: "28px"
  full: "9999px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "6": "24px"
  "8": "32px"
  "12": "48px"
  "16": "64px"
  "20": "80px"
components:
  button-primary:
    backgroundColor: "{colors.myrtle}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "0 3rem"
    height: "2.5rem"
  button-primary-hover:
    backgroundColor: "{colors.myrtle-hover}"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 3rem"
    height: "2.5rem"
  card:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.lg}"
    padding: "2rem"
  badge-primary:
    backgroundColor: "{colors.myrtle-pale}"
    textColor: "{colors.myrtle-deep}"
    rounded: "{rounded.full}"
    padding: "0.5rem 2rem"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 2rem"
    height: "2.5rem"
---

# Design System: ExpenseHub

## Overview

**Creative North Star: "The Coffee Ledger"**

ExpenseHub is Yeems Coffee's internal procurement and expense system, and it reads that way: warm, tactile, and grounded, like a well-kept ledger rather than a sterile enterprise SaaS console. The resting surface is Warm Parchment, not clinical white or slate gray — the whole app sits on a page, not a grid. Deep Myrtle green carries authority sparingly, reserved for primary actions and navigation chrome, so it still reads as confident rather than shouted. Soft Harbor Blue is the quiet second voice: focus rings, info states, hover accents — present but never competing with Myrtle for attention.

The system explicitly avoids the sterile enterprise-SaaS look (generic blue-and-gray B2B dashboards, SAP Concur-style density) in favor of something a known, trusted internal team can feel comfortable living in every day.

**Key Characteristics:**
- Warm Parchment page background with Paper-white surfaces for anything that needs to read as raised
- Deep Myrtle used sparingly and deliberately — primary actions and chrome, not decoration
- Soft Harbor Blue as the calm secondary accent (focus, info, hover)
- Generous, friendly rounding and roomy internal padding throughout
- Shadows stay nearly silent at rest and only lift meaningfully in response to interaction

## Colors

Three colors carry the whole system: a confident deep green, a warm neutral cream, and a soft blue accent — everything else is a tint, shade, or ink derived from them.

### Primary
- **Deep Myrtle** (`#2B4628`): The system's one confident color. Primary buttons, header/nav chrome, active nav tabs, active sort/selection states. Used sparingly outside those roles.

### Secondary
- **Soft Harbor Blue** (`#BCD7DE`): The calm second voice. Focus rings, info badges, secondary accents, hover highlights on secondary buttons and links.

### Neutral
- **Warm Parchment** (`#F2ECD4`): The resting background of the whole app — page background, nav bar, table header rows, subtle section dividers.
- **Paper** (`#ffffff`): Reserved for anything that needs to read as raised above the parchment floor — cards, modals, inputs, dropdowns.
- **Ink** (`#241f14`): Primary text.
- **Ink Soft** (`#5c5648`): Secondary text, meta labels.
- **Ink Faint** (`#8a8371`): Tertiary text, placeholders, disabled labels.
- **Hairline** (`#e6e2d3`): Default borders and dividers.

### Named Rules
**The Parchment Floor Rule.** Warm Parchment is the resting background everywhere. Paper (white) is reserved for surfaces that need to visually lift off that floor — never use Paper as a page background or Parchment as a card surface.

**The One Voice Rule.** Deep Myrtle is the system's only loud color. It marks primary actions and navigation chrome; it does not decorate icons, borders, or secondary UI just because green is on-brand.

## Typography

**Display / Body / Label Font:** System-native sans-serif stack (`-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', 'Segoe UI', system-ui, sans-serif`) — one typeface family for the whole system.

**Character:** A single confident system font carries every role; hierarchy comes entirely from size, weight, and letter-spacing, not a second typeface. This keeps the interface feeling native and fast rather than "designed."

### Hierarchy
- **Display** (700, 1.875rem/30px, line-height 1.25, letter-spacing -0.02em): Page titles.
- **Headline** (600, 1.25rem/20px, line-height 1.25): Section titles, card titles.
- **Title** (600, 1.125rem/18px): Card subtitles, emphasized labels.
- **Body** (400, 1rem/16px, line-height 1.5): Default paragraph and form text.
- **Label** (600, 0.75rem/12px, letter-spacing 0.04em, uppercase): Badges, table column headers, status chips.

## Layout

An 8-point-derived spacing scale drives padding, margin, and gap (`spacing-N` = N × 0.25rem, e.g. `spacing-4` = 16px, `spacing-16` = 64px). Page content is capped at `max-width: 1280px` and centered, with a `container-narrow` (960px) and `container-wide` (1440px) variant available. Grids collapse from 4→2→1 columns and 3→2→1 columns under 1024px/640px breakpoints respectively.

Internal padding runs roomier than a typical dense SaaS UI — buttons and inputs use 32–48px horizontal padding, and cards use a flat 32px (`spacing-8`) on all sides. `components.css` is the single source of truth for `.card` and `.stat-card`; `cards.css` now only carries what that file doesn't own (stat-card border-left color variants, the cost-center card family, loading shimmer) — the two files no longer define overlapping properties for the same selector.

## Elevation & Depth

Mostly flat at rest, with shadow reserved for interaction — depth is earned, not resting weight. `shadow-card` (`0 1px 3px rgba(43, 70, 40, 0.07)`) is nearly invisible on cards and list items by default; on hover or focus it steps up to a visibly stronger shadow (`shadow-card-hover` / `shadow-lg`), so the interface reads calm until something responds to you. Shadows are tinted toward Myrtle green rather than neutral black, so even elevation carries the brand's warmth instead of a cold gray cast.

### Shadow Vocabulary
- **Resting** (`shadow-card`: `0 1px 3px rgba(43,70,40,0.07)`): Default state for cards, list rows, stat tiles.
- **Interactive** (`shadow-card-hover`: `0 10px 20px rgba(43,70,40,0.12), 0 3px 6px rgba(43,70,40,0.07)`): Hover/lift state for cards and tiles.
- **Overlay** (`shadow-xl`: `0 22px 44px rgba(43,70,40,0.17), 0 8px 16px rgba(43,70,40,0.07)`): Modals and dropdowns.
- **Focus** (`shadow-focus`: `0 0 0 3px rgba(188,215,222,0.55)`): Keyboard focus ring, built from Soft Harbor Blue.

### Named Rules
**The Earned Shadow Rule.** Nothing carries a heavy shadow at rest. Weight appears only as a response to hover, focus, or active state — it signals "this responded to you," not "this is important."

## Shapes

Corners are generous and consistently rounded — nothing in the system uses sharp (0px) corners. The scale runs `sm` (8px) for compact chips, `md` (12px) for buttons and inputs, `lg` (16px) for cards and list items, `xl` (20px) for dropzones and prominent surfaces, `2xl` (28px) for hero-style banners, and `full` (9999px) for pills, badges, and nav tabs.

## Components

### Buttons
- **Shape:** `rounded.md` (12px), height 2.5rem (40px), horizontal padding 3rem (48px).
- **Primary:** Deep Myrtle background, white text, `shadow-card` at rest; darkens to Myrtle Hover on hover with a 1px lift and stronger shadow.
- **Secondary:** Paper background, hairline border, Ink text; hover shifts to a pale Soft Harbor Blue tint with Myrtle-tinted text.
- **Link:** No background; Myrtle text that underlines and shifts to Myrtle Hover on hover.

### Badges / Status Chips
- **Style:** Full-pill radius, uppercase label type, pale tint background with a deep-toned text of the same hue family (e.g. Myrtle Pale bg + Myrtle Deep text).
- **Roles:** Primary (Myrtle), Success (Myrtle — success and brand share a hue), Warning (`#d68a1f` family), Error (`#b8503f` family), Info/Secondary (Soft Harbor Blue family).

### Cards / Containers
- **Corner Style:** `rounded.lg` (16px).
- **Background:** Paper (white), never Parchment.
- **Shadow Strategy:** Resting → Interactive per Elevation & Depth.
- **Border:** 1px Hairline.
- **Internal Padding:** 32px on all sides.

### Inputs / Fields
- **Style:** Paper background, 1px Hairline border, `rounded.md` (12px), height 2.5rem (40px).
- **Focus:** Border shifts to Soft Harbor Blue, `shadow-focus` glow appears.
- **Error / Disabled:** Error border uses `#b8503f`; disabled fields shift to Warm Parchment background at 60% opacity.

### Navigation
- **Header:** Deep Myrtle diagonal gradient (`135deg, #345a30 → #1d2f1b`), white text, glassy translucent pills for user info and cart.
- **Nav bar:** Warm Parchment (Cream 50) background beneath the header; tabs are full-pill, transparent at rest, Myrtle Pale background + Myrtle Deep text when active.
- **Mobile:** Nav tabs scroll horizontally; dropdowns become fixed full-width sheets.

## Do's and Don'ts

### Do:
- **Do** keep Deep Myrtle rare and deliberate — primary actions and chrome, not a decorative accent.
- **Do** use Warm Parchment as the page floor and Paper for anything that needs to read as raised.
- **Do** let shadow intensity communicate interaction state, not resting importance.
- **Do** use full-pill radius for anything badge- or chip-shaped; reserve `lg`/`xl` for larger surfaces.

### Don't:
- **Don't** introduce a second accent hue outside the Myrtle / Soft Harbor Blue / Parchment family without a confirmed brand decision — this is a fixed 3-color system.
- **Don't** put heavy shadow on a resting surface; it belongs to hover/focus/active states only.
- **Don't** use sharp (0px) corners anywhere in the system — the rounding scale is a consistent identity marker, not a per-component choice.
- **Don't** redefine `.card`, `.stat-card`, or their sub-elements outside `components.css` — it's the single source of truth for the base recipe. Other files may only add what it doesn't own (e.g. `cards.css`'s `.stat-card` border-left color variants).
