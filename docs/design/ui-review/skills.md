# Skills for the Tatabu UI polish phase

Context: Tatabu is a local Electron desktop app (React 19, Tailwind v4.3, lucide-react, i18next with English and Arabic RTL). The owner says cards are too big and parts of the interface "feel off". The next phase polishes an existing product UI. It is not a landing page. What matters most: density, consistency, RTL correctness, and a trustworthy "tool" feel (think Linear or Raycast, not an Awwwards site).

Notes on the project that affect which skills fit:
- No Playwright dependency is installed. The renderer has a browser mock (`src/renderer/src/lib/browserMock*.ts`), and `.claude/launch.json` already defines `tatabu-dev` (npm run dev, port 5173). So the built-in Browser pane (`preview_start` plus screenshots) or the built-in `run` skill can be used for visual checks without installing anything.
- The project does not use shadcn or Radix, so shadcn-centric skills only partly apply.
- `docs/design/` already exists. An impeccable `PRODUCT.md`/`DESIGN.md`, or an interface-design `system.md`, would sit naturally next to it.

---

## 1. Installed skills to use

Fit: 5 = made for dense product UI, 1 = wrong tool.

| Skill | What it does | Phase | Fit |
|---|---|---|---|
| **impeccable** (v3.9.1, `~/.claude/skills/impeccable`) | Full design toolkit with sub-commands: `critique`, `audit`, `layout`, `typeset`, `quieter`, `distill`, `polish`, `harden`, `clarify`, `document`, `extract`, `live`. It has a separate **product register** (`reference/product.md`) that allows density, familiar patterns, one font family, a tight 1.125 to 1.2 type scale and 150 to 250 ms motion. It also bans "cards as the lazy answer", nested cards and identical card grids, which matches the owner's "cards too big" complaint. Its bundled `detect.mjs` gives deterministic anti-pattern hits. Critique, layout and other sub-commands use two isolated sub-agents. It can write `PRODUCT.md`/`DESIGN.md` as persistent context. | Audit (`critique`, `audit`), system (`document`, `extract`), implementation (`layout`, `distill`, `quieter`, `typeset`), finish (`polish`, `harden`) | **5** |
| **ui-ux-pro-max:ui-ux-pro-max** (plugin v2.11.0) | Searchable local database: 98 UX guidelines, palettes, font pairings, product types, chart types. It has a `--design-system ... --density 8` mode that outputs a dense (8 to 32 px) spacing scale and tokens for dashboards. Needs Python. Its priority list starts with accessibility, then interaction, layout and typography. It has a pre-delivery checklist (`references/pro-rules.md`). | Token and density decisions, pre-delivery checklist | **4** |
| **design:design-critique** (Anthropic knowledge-work "design" plugin, synced from claude.ai) | Structured feedback on usability, hierarchy, consistency and design principles. It is lighter and faster than impeccable's critique and works well on screenshots. | First audit, per screen | **4** |
| **design:accessibility-review** | WCAG 2.1 AA audit: contrast, keyboard, focus, screen reader. | After implementation, before release | **4** |
| **design:design-system** | Audits, documents or extends tokens, components and patterns. Good for spotting inconsistent padding, radii and card variants across views. | After the audit, to define density tokens | **4** |
| **design:ux-copy** | Microcopy, empty states, errors, onboarding, in EN. Arabic copy still needs human review. | During polish, for empty and error states and labels | **3** |
| **ui-ux-pro-max:design-system** | Three-layer token architecture (primitive, semantic, component) and Tailwind theme config. It also generates slides, which is irrelevant here. Useful to turn chosen density values into Tailwind v4 `@theme` tokens. | System phase | **3** |
| **dataviz** | Chart method: form heuristic, colour validator, stat tile and KPI rules, light and dark consistency. Relevant to `views/dashboard/ActivityChart.tsx` and the dashboard stat cards. | Dashboard and chart polish | **4** (dashboard only) |
| **brainstorming** | Turns "it feels off" into concrete, agreed targets before any code is written. | Kickoff (5 to 10 minutes) | **3** |
| **react-expert** | React 19 component refactors, e.g. extracting one shared `Card` or `Panel` with size variants, avoiding re-render issues. | Implementation support | **3** |
| **playwright-expert** | Playwright E2E tests and visual-regression snapshots (`toHaveScreenshot`). Playwright is not installed, so use it only if you decide to add screenshot baselines for EN/AR × light/dark. | Optional verification | **3** |
| **typescript-pro** | Typing for shared UI primitives and variant props. Marginal for a visual pass. | Implementation support | **2** |
| **redesign-existing-projects** | "Scan → diagnose → fix without rewriting" audit checklist. Its process and fix-priority order (font, colour, states, layout, components, empty/loading/error states) are useful. Several of its rules are landing-page minded, though: "double the spacing", noise and grain, picsum background images, "dashboard always has a left sidebar, try something else", swap Lucide for Phosphor, spring physics. Only take its checklist, not its upgrade techniques. | Audit checklist only | **3** |
| **minimalist-ui** | Warm-monochrome, flat, Notion-like "document" style with muted pastel tags. It could suit a calm tracker, but it bans Inter and Lucide (the app uses Lucide), pushes macro-whitespace and bento grids, and has no RTL guidance. Useful as a reference for an aesthetic direction, not as an implementation rulebook. | Optional: picking a visual direction | **2** |

Duplicate: **anthropic-skills:ui-ux-pro-max** is an older claude.ai copy (50+ styles, 10 stacks) of the same skill. Prefer the local plugin `ui-ux-pro-max:ui-ux-pro-max` v2.11.0, and don't load both.

---

## 2. Installed skills to avoid for this app

| Skill | Why it is a poor fit |
|---|---|
| **design-taste-frontend** (v2) | Its own header says: "Landing pages, portfolios, and redesigns. Not dashboards, not data tables, not multi-step product UI." For dashboards it redirects to Fluent, Carbon or Polaris. Baseline dials are variance 8, motion 6, density 4, the opposite of what a dense tracker needs. |
| **design-taste-frontend-v1** | Same family. It defaults to Next.js RSC and `"use client"` (wrong for Electron and Vite), requires Phosphor or Radix icons, and has a high-variance and high-motion baseline. |
| **gpt-taste** | GSAP scroll choreography, AIDA landing structure, hero rules, `py-32 md:py-48` section spacing. Built entirely for marketing pages. |
| **high-end-visual-design** | "$150k agency, Awwwards-tier": bans Inter, Lucide and 1px borders, and wants Z-axis cascades, rotations and glass. That would make a productivity tool feel strange. |
| **stitch-design-taste** | Generates `DESIGN.md` for Google Stitch screen generation, with a baseline of variance 8 and motion 6. You are not using Stitch, and impeccable's `document` covers the `DESIGN.md` need. |
| **industrial-brutalist-ui** | It does target data-heavy dashboards, but with a CRT/Swiss-brutalist aesthetic (scanlines, giant uppercase type). That is a full re-brand, not a polish, and an extreme mismatch for a personal job tracker in Arabic. |
| **image-to-code** | Image-first website generator for heroes and marketing sections. It generates mockup images and then codes them. Wrong surface. |
| **ui-ux-pro-max:design** | Logo, CIP, banners, social images, slides. Brand assets only. |
| **ui-ux-pro-max:ui-styling** | Centred on shadcn/ui and Radix, plus canvas posters. The Tailwind parts are fine, but adopting shadcn mid-polish is scope creep. Use only for its Tailwind patterns if needed. |
| **design:user-research / design:research-synthesis** | For planning and synthesising interviews and usability tests. Not useful unless you run sessions with real users. Optional later. |
| **anthropic-skills:web-artifacts-builder** | Builds claude.ai HTML artifacts, not app code. |

General caution: the "taste" skills share bans that conflict with this codebase (no Inter, no Lucide, more whitespace). If one gets loaded by accident, it will push the app away from a dense, familiar desktop tool.

---

## 3. New skills to add (not installed; research only)

None of these are installed. Review each SKILL.md before installing. Commands are as documented by each source.

| Skill / plugin | Source | What it adds that we don't have | Install command | Fit |
|---|---|---|---|---|
| **interface-design** (Dammyjay93) | https://github.com/Dammyjay93/interface-design | Built specifically for dashboards, apps, tools and admin panels, not marketing. It has a "Precision & Density" direction with a 4 or 8 px base grid, and it saves decisions (tokens, button height, card padding) to `.interface-design/system.md`, which it reloads in later sessions. The plugin version adds `design-review` and `design-deslop`. This is the most direct answer to "cards too big", and it keeps later screens consistent. | `npx skills add https://github.com/dammyjay93/interface-design --skill interface-design --agent claude-code -g` or `/plugin marketplace add Dammyjay93/interface-design` then `/plugin menu` | **5** |
| **web-design-guidelines** (Vercel) | https://github.com/vercel-labs/agent-skills | Audits UI code against Vercel's Web Interface Guidelines: concrete, checkable rules for focus, forms, hit targets, truncation, number formatting, `prefers-reduced-motion` and similar. A fast, objective "does it feel off" lint over JSX. The same repo has `composition-patterns`, useful when unifying card variants. | `npx skills add vercel-labs/agent-skills --skill web-design-guidelines` (optionally `--skill composition-patterns`) | **5** |
| **jakubkrehel/skills** (better-interface, better-layout, better-ui, better-typography, better-accessibility, interface-review, state-machine) | https://github.com/jakubkrehel/skills | Exact polish values that are often what makes UI feel off: concentric radii, optical alignment, hit areas, surface depth, type scale and truncation. `better-layout` covers grouping, alignment, reading order and **space for translated text**. `interface-review` checks a diff for UI regressions. `state-machine` renders every state of a component on a throwaway page. | `npx skills add jakubkrehel/skills` or `/plugin marketplace add jakubkrehel/skills` then `/plugin install interfaces@interfaces` | **5** |
| **arabic-rtl** (+ optional **arabic-ui**) (masrkit) | https://github.com/asasemahmed/masrkit | The only gap no installed skill covers: RTL implementation. It covers logical CSS (Tailwind `ps-*`/`ms-*`/`start-*`), bidi isolation for numbers, emails and URLs, per-icon mirroring decisions (lucide chevrons and arrows), table and chart direction, and RTL plus LTR testing at several widths. `arabic-ui` adds Arabic typography and hierarchy for dashboards and forms. Caveat: a small repo (3 stars), so read it first. Skip the Egypt-specific skills. | `npx skills add https://github.com/asasemahmed/masrkit --skill arabic-rtl` (add `--skill arabic-ui`) | **4** |
| **rtl-css** (dvorkinguy), alternative to arabic-rtl | https://github.com/dvorkinguy/claude-skills-agents | Smaller, strict rule set: never use physical properties, always logical ones, with a Tailwind mapping table. Good as a lint-style RTL check. | `npx skills add https://github.com/dvorkinguy/claude-skills-agents --skill rtl-css` | **3** |
| **web-quality-skills / accessibility** (Addy Osmani) | https://github.com/addyosmani/web-quality-skills | WCAG **2.2** (the installed design:accessibility-review targets 2.1 AA) plus Lighthouse-style evidence. Install only the `accessibility` skill. SEO and Core Web Vitals don't matter for a desktop app. | `npx skills add addyosmani/web-quality-skills` (then pick `accessibility`) | **3** |
| **webapp-testing** (Anthropic) | https://github.com/anthropics/skills (skills/webapp-testing) | Playwright via Python scripts with a `with_server.py` helper that starts the dev server, then takes screenshots, inspects the DOM and reads logs. A lightweight way to capture before/after screenshots of every view in EN and AR without adding Playwright to package.json. Overlaps with the built-in Browser pane. | `/plugin marketplace add anthropics/skills` then `/plugin install example-skills@anthropic-agent-skills` | **3** |
| **frontend-design** (Anthropic official) | https://github.com/anthropics/claude-plugins-official (plugins/frontend-design), also in anthropics/skills | Anthropic's guidance for distinctive, non-templated visual direction. Already present in the local marketplace cache, just not installed. It leans toward brand and hero work, so it only helps if you decide to refresh the visual identity, not just density. | `/plugin install frontend-design@claude-plugins-official` | **2** |
| **ui-skills CLI** (ibelick), catalog only | https://www.ui-skills.com, https://github.com/ibelick/ui-skills | A catalog with a read-only `improve-ui` audit-to-plan skill and an MCP endpoint. Mostly re-lists the skills above, so not needed if you install those directly. | `npx ui-skills list` / `npx ui-skills get <name>` | **2** |

Nothing in any catalog targeted Electron or desktop-density UI specifically. interface-design plus impeccable's product register is the closest match. No search hits came up for "density" or "visual regression" skills beyond `playwright-expert` (installed) and `webapp-testing`.

Minimum recommended additions: **interface-design**, **web-design-guidelines**, **jakubkrehel/skills** (at least better-layout, better-ui, interface-review) and **arabic-rtl**.

---

## 4. Recommended workflow for the polish phase

1. **brainstorming**: spend 10 minutes turning "cards too big / feels off" into an agreed list of target screens (dashboard, applications list, CV Studio, cover letter, settings) and a density goal, e.g. "fit about 2× more items per screen at 1366×768".
2. **Baseline screenshots (Browser pane via `tatabu-dev`, or the `run` skill)**: capture every main view in EN-LTR and AR-RTL, light and dark, as the "before" set. Fixing visible problems matters more than polishing code.
3. **impeccable `critique` per view (plus `design:design-critique` on the screenshots)**: get scored, prioritised issues (P0/P1) with isolated design review and detector evidence. This becomes the backlog.
4. **web-design-guidelines** (new) **and impeccable `audit`**: run a mechanical lint over `src/renderer/src` for focus, hit targets, truncation, contrast and reduced-motion. Merge the findings into the same backlog.
5. **interface-design** (new) **or impeccable `document`, informed by `ui-ux-pro-max --design-system --density 8`**: fix the density system once (4 px grid, card padding, radius scale, type scale 1.125 to 1.2, one shared Card/Panel with `compact` and `comfortable` sizes) and save it as `system.md`/`DESIGN.md` in `docs/design/`, so every later edit follows it.
6. **design:design-system / ui-ux-pro-max:design-system**: translate those decisions into Tailwind v4 `@theme` tokens and remove one-off `p-[..]`, `gap-[..]` and radius values across views.
7. **impeccable `layout`, `distill`, `quieter`** (with **jakubkrehel better-layout and better-ui** for exact values, and **react-expert** for component extraction): implement view by view. Shrink and merge cards, turn card grids into lists or tables where that serves the task better, and fix alignment and hierarchy.
8. **arabic-rtl** (new): pass over each touched view for logical properties, icon mirroring, bidi-isolated numbers, dates and emails, and Arabic line-height and font sizing. Re-screenshot in AR.
9. **dataviz**: polish `ActivityChart` and dashboard stat tiles so they match the new tokens and work in both themes and directions.
10. **design:ux-copy / impeccable `clarify`**: tighten labels and empty, loading and error states in EN, then hand the Arabic strings to the owner for review.
11. **design:accessibility-review** (plus Addy Osmani `accessibility` for WCAG 2.2 if installed): check contrast after the token changes, keyboard and focus order in both directions, and visible focus rings.
12. **impeccable `polish`, then jakubkrehel `interface-review` on the diff**: do a final consistency pass, then check that the branch didn't introduce regressions.
13. **Verification**: retake the step 2 screenshot matrix and compare before and after. Optionally use **playwright-expert** (or **webapp-testing**) to lock baselines with `toHaveScreenshot` for EN/AR × light/dark, so future phases can't silently re-inflate the cards.
