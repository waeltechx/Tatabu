# Tatabu: competitor and UI-density research

Date: 2026-11-19. Scope: web research only. No project files were touched.
Confidence note: most third-party reviews of job trackers are written by competing vendors or affiliates. Pixel values for Linear and Things come from third-party teardowns, not official specs. Values from official design systems (Carbon, Apple HIG, Fluent 2, Material) are marked as such.

---

## 1. Competitor table

| Product | Primary layout | What's on a card / row | Dashboard metrics | AI resume tailoring UI | Onboarding / capture | Worth copying | Known complaints |
|---|---|---|---|---|---|---|---|
| **Huntr** | Kanban board (Wishlist, Applied, Interview, Offer), drag and drop. Also has a map view, contacts CRM, and per-job activity timeline. | Title, company, color tag, logo. Details (salary, location, URL, JD, docs, contacts, interview dates) sit in the job detail, not on the card face. | "Search metrics": application counts, response rate, application-to-offer funnel. | Best-in-class flow: paste JD, then AI extracts keywords, skills, qualifications and responsibilities. Each suggestion shows **Before / After / Why** and a tag naming the requirement it covers. Per-suggestion toggle or "apply all", inline edit, undo. A coverage checklist marks each requirement covered or missing. The Job Match Score rolls up Keywords, Qualifications and Responsibilities, shown as before and after (e.g. 61 to 89). Versions are auto-saved, named, compared, and exported as PDF/DOCX. | Chrome clipper (30+ boards), autofill, mobile apps. | Before/After/Why suggestions; requirement coverage checklist; before-to-after score; versioning. | $30 to $40/mo felt expensive; no live support; autofill misses fields; tailoring works best only on resumes built in Huntr. |
| **Teal** | **Table/grid first**: sort by column, group by status, inline-edit status, dates, and excitement. | Row columns: title, company, status, excitement (1 to 5), date applied, follow-up date, salary. | Dashboard with goals and pipeline counts (help pages blocked fetch, details not verified). | "Matching Mode": keywords from the bookmarked job are colored **green (have it), yellow (toggle on), red (add it)**. Match Score updates live while editing, and 80%+ counts as strong. Keywords can be ignored, which shrinks the pool. It does not auto-insert keywords (paid AI writes bullets). Teal explicitly says the score is *not* an ATS score. | Chrome extension (desktop only), resume import parsed into sections. | Inline-editable grid; Excitement rating; follow-up date column; colored keyword chips; honest framing of the score. | Onboarding learning curve; needs constant manual updating; AI output generic; weak contact tracking; requests for custom columns; resume design limited. |
| **Simplify** | Toggle between **Columns** (kanban) and **List**. Status changes by drag, by dropdown in List, or in the detail Overview tab. | Title, company, location, status, heart (favorite). | Not documented. | Resume feedback inside each job record; AI email drafts (paid). | Auto-tracks applications sent via its Copilot extension; manual "Add Application"; **CSV import with column mapping, preview and row-error review**; CSV export. | Columns/List toggle; favorite heart; **Gmail-detected status changes shown as suggestions you approve or decline**; Archive (restorable) separate from Delete; CSV import wizard. | Autopilot submitted wrong or invented answers; refund disputes; autofill weak on Workday. |
| **Careerflow** | Kanban tracker plus notes and follow-up tasks. | Title, company, status, notes. | Basic. | AI resume builder, keyword analyzer, ATS checker, bullet writer, LinkedIn optimizer. | Chrome extension; bulk Excel import template. | Follow-up tasks attached to a job. | Tracker "less polished than Huntr or Teal"; unclear pricing. |
| **Eztrackr** | Kanban plus a separate Wishlist board. | Title, company, location, URL. | "Application statistics", skill-match analysis. | Resume scorer (ATS), cover letter, job summary, interview Q&A generators. | Extension capture from LinkedIn/Indeed. | Separate Wishlist board for passive saves. | Extension grabbed the wrong posting on LinkedIn. |
| **Jobscan** | Kanban (applications, interviews, offers). | **Match rate shown on every card**; click opens the match report to edit the resume. Interview dates, meeting links and contacts sit on the job. | Not prominent. | Match rate out of 100 plus missing hard/soft skills; 75% recommended. | Extension save from Indeed, LinkedIn, Glassdoor. | Match-score badge on the card itself. | Expensive quarterly plans; tracker is secondary to the scanner. |
| **Notion templates** | Board grouped by Status, plus Calendar, Active list and Stats views. Advice from template sellers: "most people need 3 to 4 views, not 15." | User picks which properties show on a card (board "Properties" toggle). Key properties: Status, Follow-up date, Next action. | DIY rollups. | AI drafting in some templates. | Duplicate a template. | Let users choose which card fields are visible; keep views to 3 or 4; **Next action + Follow-up date** as first-class fields. | Manual upkeep; bloated templates (90+ properties). |
| **LazyApply / auto-apply tools** | Mass auto-submit. | n/a | Volume counts. | n/a | n/a | Nothing to copy. Tatabu's "one tailored application at a time" story is the opposite and a selling point. | Reddit and reviewers criticise volume-driven spam and wrong answers. |

**Cross-competitor takeaways**
- Manual entry is the failure point every review names. Paste-to-extract and email-detected status are the antidote, and Tatabu already has both.
- Nobody in this space is local-first, BYO-key, or Arabic/RTL. Those are Tatabu's moat; the UI should feel as calm and dense as a pro tool, not like a marketing site.
- The kanban card face is small everywhere: 2 to 3 lines (title, company, one meta chip). Rich detail lives in a side panel or detail page.

---

## 2. Patterns to adopt (prioritized)

### P1. One density system, with a Compact / Default / Comfortable toggle
- **Why:** The owner's main complaint is cards that are too big. Gmail, Primer (condensed/normal/spacious), Carbon (24 to 64px rows), macOS (small/medium/large sidebar) and Material (density -1/-2/-3, each step -4px) all treat density as a token, not per-component guesswork.
- **In Tatabu:** One CSS variable set (`--row-h`, `--pad-x`, `--pad-y`, `--gap`, `--fs-body`) switched by a `data-density` attribute on `<html>`. Default = 36px rows, 13 to 14px body. A Settings > Appearance segmented control sits next to the language and theme options. Every card, row, input and button reads from the tokens.

### P2. Applications = table/list first, board as a toggle
- **Why:** Teal's inline-editable grid is its most praised feature. Simplify offers Columns/List. A list scales to 100+ applications, and kanban columns waste width on desktops.
- **In Tatabu:** A dense table (row ~36px) with columns Company, Role, Status (inline dropdown pill), Excitement, Applied, Follow-up, Match %, Last activity. Sort, group by status, column visibility menu. Board view is one click away with small cards (see sizing table). Remember the last view per user.

### P3. Detail opens in a side panel, not a full page
- **Why:** Linear's structure puts filters in headers and metadata in side panels. Things expands detail inline instead of navigating. This also removes a class of back-navigation bugs, which Tatabu recently had to fix.
- **In Tatabu:** Clicking a row opens a 420 to 480px right panel (left in RTL) with tabs Overview, CV, Letter, Emails, Notes. Esc closes it, arrow keys move between rows. "Open full page" stays available for CV Studio.

### P4. Dashboard: compact KPI strip + "what to do next", not big hero cards
- **Why:** KPI guidance is to show 4 to 6 tiles (max 8), one bold number, label top-left, trend at the bottom, minimal decoration. Huntr's useful metrics are response rate and funnel. Job seekers need follow-ups more than vanity charts.
- **In Tatabu:** Row 1 holds 4 to 5 tiles about 80px tall (Active, Applied this week, Response rate, Interviews, Offers), each with a small delta ("+3 vs last week"). Row 2 is "Follow-ups due" and "Upcoming interviews" lists (dense rows) beside the activity chart (180 to 200px tall). Optionally a thin funnel bar (Applied, Responded, Interview, Offer). Every tile links to the filtered list.

### P5. AI tailoring as reviewable suggestions (Huntr) + colored keyword chips (Teal)
- **Why:** Users distrust generic AI output (a Teal complaint) and need control. Huntr's Before/After/Why with per-item toggles is the clearest pattern found.
- **In Tatabu CV Studio:** A left pane shows requirements from the JD as a checklist (covered / missing) and keyword chips in green (present), amber (partial or synonym) and red (missing). The middle pane shows suggestion cards, each with *Covers: "<requirement>"*, Before (struck-through, muted), After, a one-line Why, and Accept / Edit / Skip buttons, plus "Accept all". The header shows Match 61 to 78 (live). Call it a "match score", never an "ATS score", as Teal does. Never silently overwrite the master CV, and save named versions per application.

### P6. Paste-to-extract with a review step
- **Why:** This is the core time-saver, but extraction mistakes are a top complaint (Eztrackr grabbed the wrong posting). One builder notes an empty field can be intentional.
- **In Tatabu:** After paste, show a compact two-column review form. Mark AI-filled fields with a subtle sparkle or "AI" tag, and highlight low-confidence or missing ones. Keep the raw JD collapsible below. Save sends the user straight to the new row in the list.

### P7. Excitement / priority and favorite
- **Why:** Teal's 1 to 5 Excitement and Simplify's heart help triage when time is short.
- **In Tatabu:** Add a 5-dot or star rating column, sortable, with a filter for "Excitement ≥ 4".

### P8. Next action + follow-up date as first-class fields
- **Why:** Notion template guidance and competitor reviews agree that reminders and follow-ups matter most after volume.
- **In Tatabu:** Add `nextAction` text and a `followUpAt` date per application. Overdue rows get a red date (semantic color only). These feed the dashboard "Follow-ups due" list.

### P9. Email-detected status as suggestions
- **Why:** Simplify's Gmail integration proposes status changes that the user approves or declines. Auto-changing status without consent erodes trust.
- **In Tatabu:** Show an inbox-style "3 status updates detected" banner. Each item shows the email snippet, the proposed status and Approve / Dismiss buttons.

### P10. Archive vs delete; CSV import/export
- **Why:** Simplify separates restorable Archive from permanent Delete, and its CSV import has mapping, preview and row errors. For a local, private app, data portability is a trust signal.
- **In Tatabu:** Make Archive the default action (rejected and withdrawn jobs auto-suggest archive) and put Delete behind a confirm. Settings > Data gets Import CSV (map columns, preview, errors) and Export CSV/JSON.

### P11. Calm color: neutral UI, semantic color only
- **Why:** Things is about 95% neutral, with color only for meaning. Linear limits its single accent to the brand mark, focus ring and primary button, and builds depth with small surface lightness steps instead of shadows.
- **In Tatabu:** Use one accent. Status pills get a fixed palette (e.g. Saved gray, Applied blue, Interview violet, Offer green, Rejected muted red). Remove decorative gradients and colored card backgrounds. Use 1px hairline borders instead of drop shadows, and three text tiers (primary, secondary, tertiary) while keeping tertiary at 4.5:1 or above.

### P12. Keyboard-first and quick add
- **Why:** Linear, Things (global quick entry) and Superhuman all win on speed.
- **In Tatabu:** Ctrl+K command palette, `N` for a new application (opens the paste box), `/` to search, `J/K` to move through rows, `1` to `6` to set status. Show shortcut hints in tooltips.

### P13. First-run checklist + useful empty states
- **Why:** Teal's onboarding curve is a common complaint. Tatabu needs a profile/CV and an AI key before the AI features work.
- **In Tatabu:** The dashboard shows a dismissible 3-step checklist: (1) Add your master CV, (2) Connect an AI provider with a "Test" button, (3) Paste your first job post. The empty applications list shows a primary "Paste a job post" button and a secondary "Import CSV" button, not a giant illustration card.

---

## 3. Density and sizing numbers (recommended values for Tatabu)

Basis: Carbon data table rows 24/32/40/48/64px (official). Apple macOS sidebar rows 24/28/32pt with 11/13/15pt text (official HIG). Fluent 2 type: Caption 12/16, Body 14/20, Subtitle 16/22 and 20/26 (official), with spacing on a 4px base plus 2/6/10 for icons. Material density steps of -4px (official, M2 or MDC). Linear-style compact rows of 32 to 36px with 13px text and 6/12px padding (third-party teardown). Tailwind maps cleanly: `text-xs` 12/16, `text-sm` 14/20, spacing unit 4px.

| Token / element | Compact | **Default (recommended)** | Comfortable | Notes |
|---|---|---|---|---|
| Spacing scale | 4-pt grid | **4, 8, 12, 16, 24, 32** | add 40, 48 | Avoid 20+ padding inside cards. |
| Body text (Latin) | 13px / 18 | **13 to 14px / 20** | 14px / 22 | Linear ~13px; Fluent body 14/20. |
| Body text (Arabic) | 14px / 22 | **14 to 15px / 22 to 24** | 15px / 26 | About +1px; line-height 1.6 to 1.7 for multi-line text. |
| Caption / meta | 11px / 16 | **12px / 16** | 12px / 18 | Fluent Caption 12/16. |
| Section heading | 13px semibold | **14 to 15px semibold** | 16px | |
| Page title | 16px | **18 to 20px semibold** | 22px | Big 28 to 32px titles feel "marketing". |
| KPI number | 20px | **22 to 24px semibold, tabular nums** | 28px | |
| List / table row | 32px | **36px** | 44px | Carbon sm=32, md=40; Linear ~32 to 36. |
| Table header row | 28px | **32px** | 36px | Match row density (Carbon). |
| Cell horizontal padding | 8px | **12px** | 16px | Carbon min 16px between columns. |
| Sidebar nav item | 28px | **32px** | 36px | macOS 24/28/32. Icon 16px, label 13px. |
| Sidebar width | 200px | **220 to 232px** | 248px | Collapsible to 56px icon rail. |
| Button / input height | 28px | **32px** | 36px | Primary CTA on empty states can be 36. WCAG 2.2 min target 24×24. |
| Icon size in rows/buttons | 14px | **16px** | 18 to 20px | |
| Kanban column width | 240px | **260 to 280px** | 300px | |
| Kanban card | padding 8px, about 56px tall | **padding 10 to 12px, 2 to 3 lines, about 64 to 84px tall** | padding 14px, about 96px | Title (13 to 14 semibold), company and location (12 muted), 1 chip row (status date, match %). |
| Card/row gap | 6px | **8px** | 12px | |
| KPI tile | 64px tall, padding 12px | **72 to 88px tall, padding 12 to 16px** | 104px | 4 to 6 per row; label 12px top-start, number, delta 12px. |
| Dashboard chart height | 140px | **180 to 200px** | 240px | |
| Side detail panel | 380px | **420 to 480px** | 520px | |
| Border radius | 4 to 6px | **6px controls, 8px cards/panels** | 10px | Linear base ~8px. Avoid 16 to 24px "bubbly" radii. |
| Borders / elevation | 1px hairline | **1px hairline; shadow only on popovers and modals** | same | Linear uses surface lightness steps instead of shadows. |
| Form/reading max width | 560px | **640 to 720px** | 760px | Settings: label column about 200px + field. |

**Quick self-check for "too big":** if a default list row is over 44px, page padding over 24px, card padding over 16px, or the KPI number over 28px, it is airier than every pro-tool reference above.

---

## 4. RTL / Arabic notes

1. **Logical properties everywhere:** Use Tailwind `ms-/me-/ps-/pe-/start-/end-`, `text-start`, and `rtl:`/`ltr:` variants instead of `ml/mr/left/right`. Set `dir` on `<html>`; the side panel and sidebar then flip automatically.
2. **Mirror only directional icons:** back/forward arrows, chevrons, "reply", progress direction and list indent. Do **not** mirror media play/pause, clocks and calendars, or checkmarks (Material Symbols and Spectrum guidance). `dir="rtl"` does not flip icons by itself, so add a `rtl:-scale-x-100` class to directional icons only.
3. **Size and line-height:** Arabic looks smaller at the same px. Bump about +1px (sources range 10 to 20%; test with real strings rather than a fixed rule). Give multi-line Arabic text a line-height of 1.6 to 1.8. **But** single-line controls (rows, buttons, pills) should use a fixed height with centered text. Otherwise a bigger Arabic line-height silently inflates every row and card, which is a likely contributor to "cards too big" in Arabic mode.
4. **Fonts:** IBM Plex Sans Arabic pairs with IBM Plex Sans for Latin (OFL). Noto Sans Arabic has the widest coverage. Cairo and Tajawal look more modern. Test at 12 to 14px, including bold and numerals. Prefer weights 500 to 600 over 700, since Arabic bold reads heavy.
5. **No letter-spacing, no uppercase, no italics on Arabic:** tracking breaks the connected script. Scope any `tracking-*` or `uppercase` utilities to `:lang(en)`.
6. **Mixed-direction content:** Job titles, company names, emails and URLs are often English inside an Arabic UI. Use `dir="auto"` on user-content cells and inputs and `<bdi>` around inline names, so punctuation and ellipses land correctly.
7. **Numbers and dates:** Choose Western (0 to 9) or Arabic-Indic digits once and apply it consistently via `Intl.NumberFormat`/`Intl.DateTimeFormat` (e.g. `ar` with `numberingSystem: 'latn'` if using Western digits). Use `font-variant-numeric: tabular-nums` in tables and KPIs.
8. **Charts:** No authoritative source was found on mirroring time axes. Pick one rule and apply it everywhere. A common choice is mirroring the activity chart so "now" sits at the start side in RTL; keep tooltips and labels correctly bidi-wrapped.
9. **Truncation:** Use CSS `text-overflow: ellipsis` with the correct `dir` so ellipses appear at the logical end. Test long Arabic company names in kanban cards.

---

## 5. BYO-provider UX notes (for Settings > AI)

**What reference apps show**
- **Raycast:** Each provider is an `id`, a `name`, an OpenAI-compatible `base_url` (*without* `/chat/completions`), and a model list (id, name, context). Tools are opt-in per provider. Speed/intelligence badges are hidden for custom models.
- **Cursor:** API key toggle, key, "Override OpenAI Base URL", then **Verify**. A custom base URL hides the default model list, so users add model IDs manually. Forum complaints: Verify spins with no feedback, the toggle re-enables itself, and the override is global, breaking other models.
- **Chatbox:** Choose "OpenAI API Compatible" and set API Host (+ optional API Path). **Check** confirms the connection; **Fetch** pulls models from `/v1/models`. Common 404 cause: `/v1` in both the host and the path.
- **Open WebUI:** URL (suggests common endpoints as you type) + key + Verify. Model IDs left empty means auto-discover; filled in, they act as an allowlist. An optional Prefix ID namespaces duplicate model names.
- **Jan:** API format (OpenAI- or Anthropic-compatible), Provider name, Base URL ("usually ends in /v1"), API key (local servers need a placeholder like `sk-no-key`). On save it fetches `{base}/models`, with a manual "+" fallback. **Test keys** calls `/models` per key and reports 401 invalid/revoked, 403 forbidden, 429 rate-limited or a network error. Multiple keys work as fallbacks. Capabilities (tools/vision) are set manually.
- **TypingMind:** Add Custom Model, fill in the details, click **Test**, then **Add Model**. Needs the full endpoint URL.
- **LM Studio** serves `http://localhost:1234/v1` (`GET /models`, `POST /chat/completions`). Ollama's OpenAI-compatible endpoint is conventionally `http://localhost:11434/v1`.

**Recommended Tatabu design**
1. Show a provider list as compact rows (logo, name, status dot: Connected / Not set / Error, default model), not big cards. Presets are Groq, Gemini, OpenAI, OpenRouter, **Custom (OpenAI-compatible)** and **Local (Ollama / LM Studio)**.
2. Fields per provider: Name (custom only), Base URL (prefilled for presets; helper text "usually ends with /v1, without /chat/completions"), API key (masked with reveal and paste, optional for localhost), Default model (combobox).
3. The **Fetch models** button calls `GET {base}/models` and fills a searchable combobox. Free-text model IDs remain allowed when `/models` is unavailable.
4. The **Test connection** button sends a tiny request and always resolves within ~10s with a specific message: 401 = "Key rejected", 403 = "Key lacks access to this model", 404 = "Check the base URL (missing or doubled /v1?)", 429 = "Rate limited, try later", network = "Can't reach host". It shows latency and the model that answered. Avoid Cursor's silent spinner.
5. Normalize input: trim whitespace, strip a trailing `/` and a pasted `/chat/completions` suffix, and warn when `/v1` is missing.
6. **Per-task model routing:** a fast/cheap model for extraction (e.g. Groq) and a stronger one for CV tailoring and cover letters, plus a fallback order if the primary fails.
7. Show a privacy line: "Keys are stored encrypted on this device (OS keychain) and sent only to the provider you choose." This reinforces Tatabu's local/private positioning.
8. Capability flags (JSON mode / structured output) should be a manual toggle per custom model, since they can't be auto-detected (Jan's guidance).

---

## 6. Sources

Competitors
- https://huntr.co/product/job-tracker
- https://huntr.co/product/resume-tailor
- https://help.huntr.co/en/articles/11535512-ai-review-ai-tailor-walkthrough
- https://www.weekday.works/post/huntr-review
- https://www.loopcv.pro/directory/huntr/
- https://jobshinobi.com/compare/huntr-vs-spreadsheet-job-tracker-reddit
- https://help.tealhq.com/en/articles/14435727-how-to-track-your-job-applications
- https://tealhq.helpscoutdocs.com/article/21-using-matching-mode
- https://help.tealhq.com/en/articles/11662593-job-matcher-ui-update-june-2025-beta
- https://enhancv.com/blog/teal-review/
- https://www.toolsforhumans.ai/ai-tools/teal
- https://www.trustpilot.com/review/tealhq.com
- https://www.tealhq.com/post/teal-vs-huntr
- https://cloudcolleague.com/blogs/job-hunting/teal-vs-huntr/
- https://help.simplify.jobs/en/articles/2140179-using-the-job-tracker
- https://simplify.jobs/faq/adding-applicationscustom-apps-4f58c0e6-aa01-4ffc-9b9b-c42da3739a34
- https://www.loopcv.pro/directory/simplify/
- https://www.weekday.works/post/simplify-jobs-review
- https://www.jobscan.co/blog/jobscan-vs-simplify/
- https://blog.loopcv.pro/careerflow-review/
- https://www.careerflow.ai/features
- https://help.careerflow.ai/en/articles/10151776-how-to-bulk-import-jobs
- https://chromewebstore.google.com/detail/eztrackr-supercharge-your/kdpbamlhffmfbgglmaedhopenkpgkfdg
- https://nz.trustpilot.com/review/eztrackr.app
- https://www.jobscan.co/job-tracker
- https://www.jobscan.co/blog/jobscan-vs-huntr/
- https://www.notion.com/help/guides/grow-with-quality-using-these-systems-to-track-applicants-and-onboard-new-hires
- https://jobshinobi.com/blog/job-tracking-best-notion-templates-2026
- https://contra.com/p/oRO2OFFl-job-url-extraction-job-trackr

Design references and density
- https://linear.app/now/how-we-redesigned-the-linear-ui
- https://linear.app/changelog/2024-03-20-new-linear-ui
- https://www.buildmvpfast.com/blog/linear-aesthetic-tokens-density-keyboard-first-ux-2026
- https://blakecrosley.com/guides/design/things
- https://carbondesignsystem.com/components/data-table/style/
- https://developer.apple.com/design/human-interface-guidelines/sidebars
- https://fluent2.microsoft.design/layout
- https://fluent2.microsoft.design/typography
- https://learn.microsoft.com/en-us/windows/apps/design/style/typography
- https://m2.material.io/blog/material-density-web
- https://material.io/design/layout/applying-density.html
- https://primer.style/components/data-table
- https://gmail.googleblog.com/2011/11/changing-information-density-in-gmails.html
- https://nhsbsa.github.io/nhsbsa-digital-playbook/data/data-visualisation/kpi-cards
- https://tabulareditor.com/blog/kpi-card-best-practices-dashboard-design
- https://www.saasui.design/blog/saas-metric-kpi-card-ux-patterns

RTL / Arabic
- https://m2.material.io/go/design-bidirectionality
- https://spectrum.adobe.com/page/bi-directionality
- https://doc.wikimedia.org/codex/main/style-guide/bidirectionality.html
- https://firefox-source-docs.mozilla.org/code-quality/coding-style/rtl_guidelines.html
- https://engineering.atspotify.com/2019/04/right-to-left-the-mirror-world/
- https://hapy.co/journal/arabic-website-design-basics/
- https://fonts.google.com/specimen/IBM+Plex+Sans+Arabic/about
- https://fontalternatives.com/blog/best-fonts-multilingual-ui/
- https://phrase.com/blog/posts/how-to-select-fonts-when-localizing-apps-and-websites/

BYO AI provider
- https://manual.raycast.com/ai/custom-providers
- https://forum.cursor.com/t/no-verify-button-when-setting-custom-openai-api-key-in-settings-models/140843
- https://forum.cursor.com/t/custom-openai-api-key-verification-stuck/96185
- https://docs.merge.dev/merge-gateway/coding-agents/cursor
- https://docs.chatboxai.app/en/guides/providers
- https://vercel.com/docs/ai-gateway/coding-agents/chatbox
- https://docs.openwebui.com/getting-started/quick-start/starting-with-openai
- https://docs.jan.ai/desktop/remote-models/custom-endpoint
- https://jan.ai/docs/install-engines
- https://blog.typingmind.com/typingmind-custom-llms
- https://docs.msty.studio/managing-models/online-providers
- https://lmstudio.ai/docs/app/api/endpoints/openai
