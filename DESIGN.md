---
name: JavaRouters
description: One API for every AI model, priced under official, set out like a money changer's rate board.
colors:
  emerald: "oklch(0.508 0.118 165.612)"
  emerald-bright: "oklch(0.696 0.17 162.48)"
  emerald-ring: "oklch(0.596 0.145 163.225)"
  emerald-ring-dark: "oklch(0.765 0.177 163.223)"
  emerald-wash: "color-mix(in oklch, oklch(0.508 0.118 165.612) 10%, transparent)"
  deep-forest: "oklch(0.262 0.051 172.552)"
  paper: "oklch(1 0 0)"
  ink: "oklch(0.145 0 0)"
  graphite: "oklch(0.49 0 0)"
  hairline: "oklch(0.93 0 0)"
  mist: "oklch(0.97 0 0)"
  charcoal: "oklch(0.235 0 0)"
  charcoal-raised: "oklch(0.285 0 0)"
  chalk: "oklch(0.965 0 0)"
  chalk-muted: "oklch(0.78 0 0)"
  strike-red: "oklch(0.577 0.245 27.325)"
typography:
  display:
    fontFamily: "Schibsted Grotesk Variable, sans-serif"
    fontSize: "clamp(2.25rem, 5.2vw, 4.25rem)"
    fontWeight: 600
    lineHeight: 1.04
    letterSpacing: "-0.035em"
  headline-lg:
    fontFamily: "Schibsted Grotesk Variable, sans-serif"
    fontSize: "3rem"
    fontWeight: 600
    lineHeight: 1.08
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Schibsted Grotesk Variable, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 600
    lineHeight: 1.111
    letterSpacing: "-0.025em"
  title:
    fontFamily: "sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.556
    letterSpacing: "-0.025em"
  body-lead:
    fontFamily: "sans-serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.625
  body:
    fontFamily: "sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.625
  button:
    fontFamily: "sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.429
  price:
    fontFamily: "sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.5
    fontFeature: "tnum"
  label:
    fontFamily: "sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.333
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.846
rounded:
  md: "12.8px"
  lg: "16px"
  xl: "22.4px"
  auth: "10px"
  full: "9999px"
spacing:
  gutter: "16px"
  gutter-sm: "24px"
  stack: "12px"
  row-y: "14px"
  cell-x: "24px"
  header: "64px"
  section: "80px"
  section-lg: "96px"
  container: "1152px"
components:
  button-primary:
    backgroundColor: "{colors.emerald}"
    textColor: "{colors.paper}"
    typography: "{typography.button}"
    rounded: "{rounded.lg}"
    height: "44px"
    padding: "0 20px"
  button-primary-compact:
    backgroundColor: "{colors.emerald}"
    textColor: "{colors.paper}"
    typography: "{typography.button}"
    rounded: "{rounded.lg}"
    height: "36px"
    padding: "0 16px"
  button-outline:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.lg}"
    height: "44px"
    padding: "0 20px"
  button-outline-hover:
    backgroundColor: "{colors.mist}"
  button-on-emerald:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.lg}"
    height: "44px"
    padding: "0 20px"
  rate-board:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
  rate-row:
    typography: "{typography.price}"
    padding: "14px 24px"
  savings-chip:
    backgroundColor: "{colors.emerald-wash}"
    textColor: "{colors.emerald}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "4px 8px"
  code-panel:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.mono}"
    rounded: "{rounded.xl}"
  closing-field:
    backgroundColor: "{colors.emerald}"
    textColor: "{colors.paper}"
    padding: "96px 24px"
  auth-value-panel:
    backgroundColor: "{colors.emerald}"
    textColor: "{colors.paper}"
    padding: "64px"
  auth-field:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.auth}"
    height: "32px"
  public-header:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    height: "64px"
---

# Design System: JavaRouters

## Overview

**Creative North Star: "The Kurs Board"**

JavaRouters' public face is a money changer's rate board for AI models. The governing artifact is a live price table: each row sets the provider's official price, struck through, beside the JavaRouters price in emerald tabular figures. Everything else on the page (headline, one changed line of code, three steps, four facts, one emerald closing field) exists to lead the eye to that board and then to "Buat akun". The surface reads clean and professional: white ground, near-black ink, one emerald, 1px hairline rules, generous section air, and no ornament that the rate board does not earn.

Scope is the public surface only: the landing page, the shared public header, the landing footer, and the auth layout (sign-in, sign-up, password reset). The console keeps the upstream New API layout and inherits only the emerald accent tokens from `web/src/styles/javarouters-theme.css`, which override the base palette's accent slots so every page is green from first paint. Light mode is the default; dark mode swaps the ground to charcoal and the accent to a brighter emerald. The default UI language is Indonesian, and all copy is i18n keyed, so layouts must tolerate Indonesian strings that run longer than English.

The system is built on New API (QuantumNous, AGPLv3). The upstream attribution in the footer is a fixed constraint, not a styling choice: it stays visible, linked and readable on every page that carries the footer.

**Key Characteristics:**
- White paper ground, near-black ink, a single emerald accent; no gradients, glass, kickers or icon tiles.
- Tabular numerals for every price; official price struck through in muted grey, JavaRouters price in emerald.
- Monospace for model names and code; Schibsted Grotesk for display; the body font for everything else.
- Hairline 1px rules divide rows, sections and the footer; the only cast shadow is the scrolled header.
- Left-aligned headings inside a 1152px container; emerald fills are reserved for the closing field and the auth value panel.
- Live data only: model counts and prices come from `/api/pricing`, never from hard-coded numbers.

## Colors

One emerald on white, with neutral greys doing all structural work.

### Primary
- **Ledger Emerald** (`emerald`, Tailwind emerald-700, about #047857): the light-mode `--primary`. JavaRouters sell prices, the second line of the hero headline, primary buttons, active tab underlines, the hourly-sync dot, step numbers, text links in the board footer, and the full-bleed closing field and auth value panel. White text on it meets WCAG AA (about 5.5:1).
- **Signal Emerald** (`emerald-bright`, emerald-500, about #10b981): the dark-mode `--primary`, carrying the same roles on charcoal. Text set on it uses Deep Forest, not white.
- **Ring Emerald** (`emerald-ring`, emerald-600; `emerald-ring-dark`, emerald-400 in dark mode): focus rings, native `accent-color`, chart series 1. Never used under text.
- **Emerald Wash** (`emerald-wash`, primary at 10%): the savings chip ground and the added line in the code diff. Text selection uses primary at 22%.
- **Deep Forest** (`deep-forest`, emerald-950): foreground on Signal Emerald in dark mode.

### Neutral
- **Paper** (`paper`): page, card, header and input ground in light mode; also the inverted button on emerald fields.
- **Ink** (`ink`): headings, model names, primary text.
- **Graphite** (`graphite`): `--muted-foreground`. Supporting copy, struck-through official prices, table headers, footer links, the required attribution.
- **Hairline** (`hairline`): `--border`. Card outlines at full strength; row, section and footer dividers at 70% opacity.
- **Mist** (`mist`): `--muted`. Outline and ghost button hover ground; the rate board footer strip at 30%.
- **Charcoal** (`charcoal`) and **Charcoal Raised** (`charcoal-raised`): dark-mode page and card grounds.
- **Chalk** (`chalk`) and **Chalk Muted** (`chalk-muted`): dark-mode ink and muted ink.
- **Strike Red** (`strike-red`): `--destructive`. Used on the public surface only for the removed line in the code diff, at 8% ground and 90% text.

### Named Rules
**The One Emerald Rule.** Emerald means "JavaRouters": our price, our action, our field. It never decorates; a second accent hue does not exist on the public surface.

**The Struck Official Rule.** An official price appears only struck through (1.5px decoration) in Graphite, immediately beside its emerald sell price. The pair is the brand's proof and is never split across columns.

## Typography

**Display Font:** Schibsted Grotesk Variable (self-hosted via `@fontsource-variable/schibsted-grotesk`, falling back to the UI sans)
**Body Font:** `var(--font-body)`, which resolves to the browser's sans-serif by default; Public Sans Variable (self-hosted via `@fontsource-variable/public-sans`) when the theme font axis is set to Sans
**Label/Mono Font:** the Tailwind monospace stack (ui-monospace, SFMono-Regular, Menlo, Consolas)

**Character:** A tight, slightly condensed grotesk sets confident headlines with negative tracking, over a plain sans body that stays out of the way; monospace marks anything a developer would type.

The direction contract names Public Sans as the body face. The build currently renders the browser sans-serif unless a visitor picks Sans in the theme settings, so the frontmatter records `sans-serif`. Making Public Sans the default body on public pages is an open decision, not a settled rule.

### Hierarchy
- **Display** (600, clamp(2.25rem, 5.2vw, 4.25rem), line-height 1.04, -0.035em, balanced): the hero headline only, two lines, the second in emerald.
- **Headline Large** (600, 2.25rem below 640px and 3rem above, -0.03em): the closing field headline and the auth value panel statement (line-height 1.08 there).
- **Headline** (600, 1.875rem below 640px and 2.25rem above, -0.025em, balanced): section headings ("Ganti satu baris. Selesai.", "Mulai dalam tiga langkah", "Kenapa JavaRouters").
- **Title** (body font, 600, 1.125rem, tight tracking): step titles; fact terms use the same weight at body size.
- **Body Lead** (400, 1.125rem, line-height 1.625, Graphite, max 42rem): the hero supporting line.
- **Body** (400, 0.875rem to 1rem, line-height 1.625, Graphite): section copy, step and fact detail, capped near 28rem (`max-w-md`/`max-w-xs`) where it sits beside a heading.
- **Price** (600, 0.875rem mobile and 1rem from 640px, tabular numerals): JavaRouters prices in emerald; the struck official price beside it is 0.75rem to 0.875rem in Graphite.
- **Label** (500, 0.75rem): table column heads, the "per 1 juta token" note, the board footer note, footer bottom line.
- **Mono** (500, 13px mobile and 14px from 640px for model names; 13px on a 24px line for code).

### Named Rules
**The Tabular Price Rule.** Every number that a visitor compares (prices, savings percentages, model counts, step numbers) is set with tabular numerals so columns align row after row.

**The Typed-Name Rule.** Model identifiers are shown exactly as the API expects them, in monospace, never prettified or title-cased.

## Layout

A single centred container, 1152px wide (`max-w-6xl`), with 16px gutters on mobile and 24px from 640px. Headings are left-aligned; nothing on the landing page is centred except empty and error states inside the rate board.

- **First viewport:** the hero sits 96px (112px from 640px) below the top, clearing the 64px fixed header. Headline, one supporting line, then the two CTAs in a wrapping row with a 12px gap; the rate board follows 48px below and is meant to be visible above the fold at 1440x900.
- **Section rhythm:** 80px vertical padding, 96px from 1024px. Sections are separated by hairline rules (the steps band carries a top and bottom rule) or by a change of ground (the emerald closing field).
- **Split sections:** the code snippet and the facts use a 5:7 grid from 1024px with a 64px gap; the facts heading becomes sticky (top 112px).
- **Steps:** three columns from 768px, divided by left hairlines with 32px inner padding; stacked with 40px gaps below.
- **Footer:** a 2:1:1 grid from 768px (brand, Produk, Perusahaan), then a full-width hairline and a bottom line that splits copyright with legal links on the left and the New API attribution on the right from 640px.
- **Auth:** two equal columns from 1024px. Left: a 64px brand bar and a centred form column capped at 420px. Right: the emerald value panel with 48px padding (64px from 1280px). Below 1024px only the form column shows.
- **Breakpoints:** Tailwind defaults (640, 768, 1024, 1280). The header switches from inline navigation to a menu button below 1024px.

## Elevation & Depth

The public surface is flat. Depth comes from 1px hairline outlines, a 30% Mist strip under the rate board, and full-bleed emerald fields, not from shadows. The only shadow appears on the public header once the page scrolls past 8px (or the mobile menu opens), together with its bottom border fading in over 300ms.

### Shadow Vocabulary
- **Scrolled header** (`box-shadow: 0 1px 0 rgba(16,24,40,0.02), 0 6px 16px -12px rgba(16,24,40,0.18)`): marks the fixed header as lifted above scrolled content. Not used anywhere else.

### Named Rules
**The Flat Board Rule.** Cards, the rate board and the code panel sit flat on the page with a hairline outline. If something needs to feel separate, give it a rule or a ground change, not a shadow.

## Shapes

Softly rounded rectangles derived from the theme's `--radius` (1rem on the landing page): buttons and the header CTA use the full radius (16px), the savings chip and nav links 12.8px, and the large panels (rate board, code panel) 22.4px. The auth layout lowers `--radius` to 0.625rem so its 32px inputs and buttons read as fields rather than pills (10px). Small details are fully round: the hourly-sync dot (6px). Borders are always 1px; divider rules run at 70% of the hairline colour.

The direction contract asked for 8 to 12px radii; the shipped landing page inherits the larger base radius. This is recorded as the current state, and tightening it would be a deliberate system change.

## Components

### Buttons
Confident, flat, and few: one primary and one secondary per decision.
- **Shape:** gently rounded (16px on the landing page, 10px inside auth).
- **Primary:** Ledger Emerald with white text, 44px tall, 20px horizontal padding, 600 weight, trailing arrow icon for forward actions ("Buat akun", "Buka konsol"). The header uses a 36px compact version ("Daftar", "Konsol").
- **Outline (secondary):** Paper with a hairline border and Ink text at the same size ("Lihat semua harga"); hovers to Mist.
- **On emerald:** inside the closing field the primary inverts to Paper with Ink text, and the secondary becomes a transparent outline at 40% white with white text that hovers to a 10% white wash.
- **Ghost:** header "Masuk" and the copy action, transparent until hover (Mist).
- **Focus / press:** 3px ring in Ring Emerald at 50%; a 1px downward nudge on press.

### Rate Board (signature)
The kurs board itself: a hairline-outlined Paper panel (22.4px radius) holding a real table.
- **Top bar:** line tabs for model families (Claude, GPT, Gemini, DeepSeek, Model lain) with a 2px emerald underline on the active tab, and on the right a 6px emerald dot beside "Per 1 juta token · disinkronkan otomatis tiap jam".
- **Rows:** five per family, each divided by a 70% hairline, 14px vertical and 24px horizontal padding (16px on mobile). Model name in monospace; Input and Output columns right-aligned, each holding the struck official price and the emerald sell price; a Savings column (hidden below 640px) with the savings chip. On mobile the price pair stacks with the struck price above.
- **Motion:** on tab change rows settle in from 35% opacity and 6px below, 420ms `cubic-bezier(0.16, 1, 0.3, 1)`, staggered 45ms per row. Content is visible without motion and the animation is off under reduced motion.
- **States:** skeleton rows while loading; a centred muted message with a small outline "Coba lagi" button on error; a muted empty message when no models exist.
- **Footer strip:** Mist at 30% with the note that struck prices are official prices, and an emerald text link "Lihat semua model dan harga" with an arrow.

### Savings Chip
- **Style:** Emerald Wash ground, emerald 600-weight 0.75rem text, tabular numerals, 12.8px radius, 4px by 8px padding. Shows "Hemat 30%" computed from the live markup, never typed in.

### Switch Snippet ("Ganti satu baris")
A code diff that proves switching is one line.
- **Container:** hairline-outlined Paper panel (22.4px radius); a top bar with line tabs (Python, Node.js, curl, Claude Code, 13px) and a ghost copy button with a tooltip.
- **Lines:** 13px monospace on a 24px line with a 20px marker gutter. Context lines at 80% ink; the removed line struck through on an 8% Strike Red ground; the added line at 500 weight on Emerald Wash. Screen readers hear "Removed line" and "Added line".
- **Data:** the base URL is the gateway's own server address and the model is a live sold model.

### Inputs / Fields
Auth forms use the shared upstream form components inside the auth layout's 10px radius: Paper ground, hairline border, 32px tall, Graphite placeholder, emerald focus ring. The primary submit spans the form width.

### Navigation
- **Public header:** fixed, 64px, Paper ground with a transparent border at rest; border and the scrolled-header shadow fade in after 8px of scroll. Brand lockup left (28px logo, system name in Schibsted Grotesk 600), then text links (0.875rem, 500, Graphite, Ink on hover and when current, 12.8px radius hit area). Right side: language switcher, theme switch, notifications, then "Masuk" (ghost) and "Daftar" (primary compact), or "Konsol" plus the profile menu when signed in.
- **Mobile (below 1024px):** theme switch and a menu button; the menu opens as a bordered Paper sheet under the bar with 1rem links on 12px vertical padding and the language switcher plus auth actions beneath a hairline.
- Home and Console links are omitted from the nav because the logo and the auth button already reach them.

### Closing Field
A full-bleed Ledger Emerald band, 80px (96px from 1024px) vertical padding, Headline Large in white, a supporting line at 85% white, and the on-emerald button pair aligned to the bottom right from 1024px.

### Auth Value Panel
The emerald half of the auth pages: a live model count at the top (80% white, tabular), the Headline Large statement "Satu API untuk semua model AI.", three value points each led by a 20px check icon at 90% white, and a closing line at 75% white at the bottom.

### Brand Lockup
Logo (28px, 6px-radius container) beside the system name set in Schibsted Grotesk 600 at 1rem with tight tracking; used in the header, footer and auth bar. Open items: the system name currently reads "Java routers" in admin configuration (the brand is JavaRouters), and no JavaRouters logo exists yet, so the default New API logo is shown until one is supplied.

### Footer
Hairline top rule; brand lockup with the one-line tagline and optional admin footer HTML; Produk (Model dan harga, Konsol, Dokumentasi when a docs link is set) and Perusahaan (Tentang) link groups at 0.875rem Graphite, Ink on hover. The bottom line (0.75rem) carries the copyright and legal links on one side and the New API attribution on the other.
- **Fixed constraint:** the attribution "© {year} New API. {attribution text}" links to `https://github.com/QuantumNous/new-api` and is forced to full Graphite contrast (the upstream component would dim it to 45%). It must not be removed, hidden, reworded away from New API/QuantumNous, or dimmed.
- **Open item:** a support email will be added once the address is provided; none may be invented.

## Do's and Don'ts

### Do:
- **Do** set every JavaRouters price in emerald with tabular numerals, directly beside its official price struck through (1.5px) in Graphite.
- **Do** read model names, counts and prices from `/api/pricing` and show skeletons, an error with retry, or an empty message instead of placeholder numbers.
- **Do** set model identifiers and code in monospace, exactly as the API expects them.
- **Do** separate rows and sections with 1px hairlines at 70% of the border colour, and keep panels flat with a hairline outline.
- **Do** keep emerald fills to the closing field and the auth value panel; everywhere else emerald is text, an underline, a dot or a 10% wash.
- **Do** keep the New API attribution in the footer visible, linked to QuantumNous/new-api, at full muted contrast.
- **Do** write UI text as i18n keys with Indonesian as the default language, and let headings wrap with balanced text.
- **Do** honour reduced motion: content is visible without animation, and the rate-row settle is the only entrance motion.

### Don't:
- **Don't** use gradients, glass or blur, kickers or eyebrow labels above headings, or icon tiles; the direction contract rules them out and the build carries none.
- **Don't** introduce a second accent hue or use emerald decoratively.
- **Don't** add shadows to cards, the rate board or the code panel; the scrolled header is the only shadow.
- **Don't** hard-code model counts, prices or the savings percentage.
- **Don't** add testimonial strips, customer logo walls or usage statistics; none exist to show.
- **Don't** show Rupiah, QRIS or bank-transfer payment marks until such a payment method exists.
- **Don't** remove, hide, dim or restyle away the New API / QuantumNous attribution.
- **Don't** restyle the console from this system; it keeps the upstream layout and takes only the emerald tokens.
