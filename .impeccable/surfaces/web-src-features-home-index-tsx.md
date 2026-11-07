---
version: 1
slug: "web-src-features-home-index-tsx"
primary_target: "web/src/features/home/index.tsx"
related_targets: ["web/src/components/layout/components/public-layout.tsx","web/src/features/auth/auth-layout.tsx"]
---

# Surface brief: JavaRouters public pages

Scope: landing page (`/`, default branch when no admin home content is set), the shared public header used by all public pages, the landing footer, and the auth layout (sign-in, sign-up, password reset). Console stays upstream. Visitor mode: Persuade.

Audience and job: Indonesian developers, AI coding tool users, companies and resellers deciding whether to move their AI API spend. Action: create an account (`/sign-up`), secondary: read all prices (`/pricing`). Proof on hand: live model list and prices from `/api/pricing`, OpenAI/Anthropic-compatible endpoints, Singapore servers, hourly price sync. No testimonials, logos or statistics exist. Constraints: Indonesian by default; New API attribution stays visible; no Rupiah payment claim; support email to be supplied by the user.

Memorable moment: the official price struck through beside the JavaRouters price, live, row after row, like a money changer's rate board.

## Direction contract

THESIS: The landing page is an AI rate board: live model prices set like a money changer's kurs board, official price struck through beside ours. It refuses the category default of a gradient headline over equal feature cards beside a terminal demo.

OWN-WORLD: White ground, near-black ink, one emerald (#047857 light, #10b981 dark) used for the JavaRouters price column, primary actions and the closing field. Hairline 1px rules, tabular numerals, Schibsted Grotesk display, Public Sans body, small 8-12px radii, no gradients, glass, kickers or icon tiles.

STORY: The visitor sees that one key reaches Claude, GPT, Gemini and more at about 30% under official prices, sees the proof in live rows, sees that switching is one changed line of code, then creates an account.

FIRST VIEWPORT: Left-aligned headline across the content width at display scale, one supporting line, "Buat akun" primary and "Lihat semua harga" secondary in one row; directly beneath, still above the fold at 1440x900, the full-width rate board: family tabs, five model rows (model, input/1M, output/1M, savings), official prices struck through, JavaRouters prices in emerald tabular figures, a note that prices sync hourly.

FORM: User-pinned direction (clean and professional, emerald on white), the money changer rate board as the governing artifact; no concept-seed roll because the user pinned the direction; seed key: none (pinned).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Signature interaction: "Ganti satu baris", a code diff whose single changed line swaps the provider base URL for the JavaRouters URL, with Python, Node.js, curl and Claude Code tabs and a copy action. Motion: rate board rows settle in with a short staggered exponential ease-out on tab change; content is visible by default and respects reduced motion.
