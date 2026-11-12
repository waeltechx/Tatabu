# منصة تتبع — public desktop app (Windows + macOS) — design

Date: 2026-11-12 · Status: draft for approval

## 1. Intent

The author built a personal, single-user job-application tracker
(`job-tracker`, kept locally outside this repo; Python/FastAPI + React,
launched from a venv). It works well for them. They now want to **release it to
other job seekers**: a normal app anyone can download from GitHub and install by
double-clicking, on **Windows and macOS**, with each person's data kept on their
own computer and each person using **their own AI keys**.

The rebuild also adds what the personal version lacks: a **per-job tailored CV**
(in the app's ATS template *or* in the user's own design, learned from their PDF),
an **Arabic + English** interface and documents (plus any language the user adds),
**dark mode**, settings instead of a `.env` file, folders named after the job,
and in-app updates.

Success looks like: a non-technical job seeker installs it in under two minutes,
pastes a key, uploads their CV, and gets a tailored CV and cover letter for a
posting without any invented facts.

## 2. Goals, non-goals, anti-goals

**Goals (v1)**
- One codebase; one release produces a Windows installer and a macOS installer.
- Install by double-click; no terminal, no Python, no Node on the user's machine.
- In-app update notice and one-click update.
- All user data stored locally; the app ships empty.
- Every AI feature runs on the user's own keys, entered in Settings.
- Interface in English and Arabic (full RTL), light / dark / system theme.
- Documents (CV, cover letter, references) in English, Arabic, or any language the
  user adds by name.
- CV tailoring per application in two looks: ATS template or "my design".
- Everything that works in the reference app keeps working (see §6).

**Non-goals (v1)**
- Accounts, cloud sync, multi-device sync, mobile, Linux builds.
- Scraping job boards or a browser extension.
- Editing the user's original Word/PDF file in place.
- Code signing / notarization (planned later; see §8).
- Spreadsheet import (proposed in mockups; deferred to v1.1 — builder's call to
  hide the button or show it disabled).
- Importing the author's existing data from the reference app (author's decision:
  not now, no importer).
- Paid code signing on either platform (author's decision: free only).

**Anti-goals (failure even if it "works")**
- AI-generated CV/letter text states a fact (employer, title, date, number, skill,
  degree) that is not in the user's master CV or their own answers **without the
  user being warned about it**. (The app warns; it never stops the user from
  writing or keeping anything — the user has the final say.)
- Any user data leaves the machine other than the text/images sent to the AI
  provider the user chose.
- The release contains the author's personal data (the reference `data/` folder,
  `.env`, CVs, 113 applications).
- An update loses or corrupts user data.
- Users must open a terminal, edit a config file, or visit GitHub to update.

## 3. Constraints

- **Fixed identifiers (never change after v1):** product name `Tatabu` (Arabic
  display name منصة تتبع), appId / macOS bundle id `com.waeltechx.tatabu`,
  executable `Tatabu`, GitHub repo `waeltechx/Tatabu` (public, created
  2026-11-12) — it is the update feed.

- Reference project is **read-only**: read it, port logic from it, never modify it.
- New project lives in its own folder, published on GitHub.
- Platforms: Windows 10/11 (x64), macOS 12+ (Apple Silicon + Intel).
- Works offline except for AI calls and the update check. No runtime CDN — fonts and
  assets are bundled.
- Launch unsigned on both platforms (see §8 for the consequences).
- AI providers: **Groq** is the primary (text + voice). Optional second provider for
  text only: **Gemini, OpenAI, OpenRouter** (all OpenAI-compatible).

## 4. Approaches considered

| | Approach | Trade-off |
|---|---|---|
| A | Keep Python/FastAPI + React, wrap with PyInstaller + pywebview, Inno Setup installer | Reuses the most reference code. Updater must be hand-built; Mac build is a separate, fragile track; AV false positives on PyInstaller. |
| **B (picked)** | **Electron + React + TypeScript, backend logic rewritten in TypeScript in Electron's main process** | Mac + Windows from one codebase; `printToPDF` built in (best path for Arabic/RTL and HTML CV templates); electron-builder makes both installers; electron-updater handles updates from GitHub Releases. Cost: port ~3.7k lines of Python; installer ~120 MB. |
| C | Tauri + Python sidecar | Small shell, but three languages and no built-in print-to-PDF. Rejected by the author. |

**Why B:** the author wants a Mac build from day one. B gives both platforms, PDF
rendering, installers and updates as solved problems. A Python sidecar inside
Electron was rejected (two runtimes to package per OS for no user benefit); the
React UI and the reference's prompts, schemas and algorithms are ported, not
discarded.

## 5. Architecture (decided)

- **Shell:** Electron, main process in TypeScript. Renderer: React 18 + TypeScript +
  Vite + Tailwind (as in the reference), TanStack Query, Radix primitives,
  lucide icons, sonner toasts.
- **Renderer ↔ main:** typed IPC via `contextBridge` (no local HTTP server, no port).
  `contextIsolation` on, `nodeIntegration` off.
- **Storage:** SQLite (better-sqlite3) in `app.getPath('userData')`, with a
  `schema_version` table and forward-only migrations run at startup. A backup copy of
  the DB is taken before each migration.
- **Documents folder:** default `<Documents>/Tatabu/`, changeable in Settings
  ("Change…" moves the existing folder after confirmation). One sub-folder per
  application named `Company – Job title` (sanitized for both OSes; duplicates get
  ` (2)`, ` (3)`). Library files live in `<docs>/_Library/`.
- **Secrets:** API keys encrypted with Electron `safeStorage` (DPAPI on Windows,
  Keychain on macOS); never written in plain text, never logged.
- **AI layer:** one client over the OpenAI-compatible API (`openai` npm SDK, custom
  `baseURL`). Two roles: `voice` (always Groq Whisper) and `text` (Groq by default,
  or the alternative provider when enabled). Structured output via zod schemas →
  JSON Schema, with the reference's degrade path (json_schema → json_object →
  prompt-only) and one validate/repair retry. The model list per provider is fetched
  from the provider's `/models` endpoint; a sensible default is preselected.
  "Test" in Settings makes a tiny call; a second probe checks image input
  (vision) and shows "Reads images · CV design works" or a warning.
- **Per-task model (settled after review):** tasks that need image input ("Teach
  your design") automatically use a vision-capable model *of the active text
  provider* (for Groq, a vision model from its `/models` list, verified at build
  time), so a Groq-only user gets "My design". Only if the provider has no vision
  model does the screen point to Settings.
- **Failures and rate limits (settled after review):** no silent failover to the
  other provider (privacy: the user chose where text goes). On error the app shows
  a plain message with Retry; when a second provider is configured it also offers
  "Try with <other provider>" as an explicit button. Long prompts are kept within
  the model's context by sending the structured master record, not the raw PDF text.
- **PDF out:** every document (CV both looks, cover letter, references) is an HTML
  template rendered in a hidden `BrowserWindow` and saved with
  `webContents.printToPDF` (A4 default, Letter optional). Combine/merge and
  image→PDF with pdf-lib.
- **PDF/DOCX in:** pdfjs-dist for text extraction and for rendering pages to PNG (for
  the vision model); mammoth for DOCX text.
- **Fonts bundled:** Space Grotesk, Inter, IBM Plex Mono, IBM Plex Sans Arabic,
  Noto Sans Arabic (all OFL).
- **i18n:** react-i18next, `en` + `ar` UI strings; `dir="rtl"` flips layout using
  CSS logical properties; the hard drop-shadow mirrors in RTL.
- **Theme:** CSS variables, light / dark / system (tokens in §7).
- **Packaging & release:** electron-builder. GitHub Actions on tag `v*`: matrix
  `windows-latest` (NSIS `Setup.exe`) and `macos-latest` (universal `.dmg`),
  uploads to a draft GitHub Release. The author never needs a Mac to build.
- **Updates:** electron-updater, GitHub provider. On launch, check quietly; if newer,
  show a banner ("Version x.y ready · What's new · Update"). Windows: download and
  install on restart. macOS unsigned: auto-install is not possible, so the banner's
  button opens the release's `.dmg` download instead (switch to full auto-update
  once signed).

## 6. Features (v1)

Ported from the reference unless marked **new**.

1. **First run** (new) — 3 cards: app language + theme; Groq key (with how-to-get
   link, Test); upload CV (PDF/DOCX, skippable). Mockup: `new-screens.html` → First run.
2. **Dashboard** — stats, status donut, 14-day activity chart, table with search +
   status filter; **new** empty state with the 3-step flow and a setup checklist
   (Groq, CV, profile & signature, default referees).
3. **Add application** — paste the posting (or dictate it) → AI extracts
   `JobExtraction` (reference schema: company, title, location, work mode, source,
   deadline, salary, description, requirements, language, contact person, company
   address, notes) → review screen → save. Posting `language` becomes a free
   language code (no longer `en|de`). **Duplicate detection**: port all signals of
   `app/duplicates.py` (canonical URL/job-board IDs, reference numbers, embedded
   URLs/emails, overlap coefficient on shingles, cheap pre-AI identity, fuzzy
   company/title/location, fingerprint + hash).
4. **Application detail** — Job info (click-to-edit, autosave, copy buttons), Notes,
   Files (upload, attach from library, combine into one PDF in chosen order,
   delete), **new** "Open folder" (`shell.openPath`). Status select. Delete
   application asks whether to also move its folder to the OS trash.
5. **CV Studio** (new) — see §6.1.
6. **Teach your design** (new) — see §6.2.
7. **Cover letter** — port prepare (3–4 subject options + 0–4 clarifying
   questions), generate, edit, word count, recipient block, enclosures (from the
   application's files/library), signature, "Copy prompt" for external AIs, save
   PDF to the application folder. Language buttons: English, العربية, plus any
   added languages (replacing English/German/Both; "write in two languages" stays
   available as multi-select). German letters keep the DIN 5008 layout; Arabic
   letters render RTL. **Grounding (settled after review):** letters use the same
   structured master record and the same shared verifier as CVs (§6.1): after
   generation, unsupported claims appear as warnings with **Show me** (jumps to and
   highlights the sentence in the letter editor) and **Fix it**; the user can keep
   them and still save the PDF.
   **Letter layouts (new, author's request):** the user picks a layout from
   thumbnails in the cover-letter screen; the choice is remembered per document
   language. Layouts come in two families by script direction, so any added
   language works: LTR for Latin-script languages, RTL for Arabic-script/Hebrew.
   All seven layouts ship in v1 (author confirmed; mockup `letter-templates.html`):
   - LTR **Classic** — sender block top right, recipient below on the left, date,
     subject, body (default for English and other Latin languages).
   - LTR **DIN 5008** — German standard with return-address line and window-position
     recipient, numeric date, "Anlagen" (default for German).
   - LTR **Modern header** — name band with one contact line; may borrow colours from
     the user's "My design" CV template.
   - LTR **Block (US)** — everything left-aligned.
   - RTL **رسمي عربي** — sender right, date left, centred الموضوع, تحية طيبة وبعد،
     closing وتفضلوا بقبول فائق الاحترام والتقدير، signature bottom left (default
     for Arabic).
   - RTL **Classic mirrored** and RTL **Modern header** — mirrors of the LTR ones.
   Fixed labels (date format, "Subject"/"Betreff"/"الموضوع", greeting style,
   "Enclosures"/"Anlagen"/"المرفقات") come from the letter's language (Intl date
   formatting + per-language label table for en/ar/de, AI-supplied labels for other
   added languages).
8. **References** (changed) — default referees saved once in Settings; each
   application's References PDF is produced from them with only the job title/subject
   changing. Per-application override (swap/remove/add a referee) without changing
   the defaults. "Include relationship" toggle kept.
9. **Email status** — paste an email → AI matches an application + detects status +
   confidence + reasoning → user confirms before anything changes.
10. **Profile** — header details, links, signature pad, library documents.
11. **Settings** (new) — mockup `settings.html`: Groq key (show/test, connected
    chips); "Use a different model for text" (provider, key, model, vision chip);
    default references; app language; theme; document languages (add by name,
    remove non-defaults); storage folder (open / change), backup export to `.zip`
    and restore; check for updates; version.
12. **Voice input** — mic button beside every free-text input used for AI
    (posting, answers, highlights, design feedback, email) → Groq Whisper.

### 6.1 CV Studio

- **Master CV:** uploaded once (PDF or DOCX). AI converts it to a structured master
  record (contact, summary, experience with bullets, education, skills, languages,
  certificates, projects, other sections kept verbatim). The user can view/correct
  the master record. This record is the only source of CV facts.
- **Per application:** pick application + output language + look (ATS template /
  My design) + optional "anything to highlight" → "Tailor my CV".
- **What the AI may do:** select, reorder, shorten, and reword existing facts;
  rewrite the summary from existing facts; translate. **It may not** add any
  employer, title, date, number, skill, tool, degree or certificate absent from the
  master record or the user's answers.
- **Output:** the tailored structured CV + a change list. Each change carries type
  (rewritten / reordered / reworded / left out), old text, new text, and source
  (which master-record field it came from). A separate list "Not in your CV — not
  added" names job requirements the user lacks.
- **Verification step (code, not AI) — builder's call, settled after review:** the
  AI's structured output attributes every fact-bearing item (bullet, summary
  sentence, skill, date, number, organization) to the master-record field(s) or
  user answer it came from. Code then checks each item against *its cited source*,
  not the whole CV as a string: numbers and dates are normalised (Arabic-Indic ↔
  Latin digits, translated month names, date formats) and must match a value in the
  cited field; organization names, tools and skills must match the cited field
  either verbatim or as a translation/transliteration the AI declared for that exact
  source string. Items with no source, or that fail the check, are flagged and
  shown as warnings (see next point). This works the same
  for translated output.
- **Warn, never block (author's decision):** a flagged item never prevents saving
  or exporting. The review shows a warning list ("This isn't in your CV: …") where
  each warning has **Show me** (scrolls the editor/preview to that exact text and
  highlights it so the user can edit it in place) and **Fix it** (AI rewrites just
  that item from the cited sources). The user may dismiss the warning and keep the
  text as is. Only AI-generated text is checked; what the user types themselves is
  never flagged.
- **What counts as a source:** the master record, and the user's answers to
  clarifying questions (e.g. "earliest start date"). The "Anything to highlight?"
  box only steers emphasis; it is not a fact source.
- **Review UI:** preview with changed lines highlighted; change list with
  accept/reject per change; "Undo all"; Save as PDF into the application folder;
  Open folder. Mockup: `new-screens.html` → CV Studio.
- **ATS template:** single column, real text (selectable), standard section names,
  no tables/columns/icons for content; LTR and RTL variants.

### 6.2 Teach your design

- Upload the CV PDF → render page(s) to PNG + extract text/positions → a vision
  model returns an **HTML/CSS template with placeholders** bound to the structured
  CV fields (repeating blocks for experience/education/skills). Embedded photo and
  images are extracted and reused.
- Side-by-side: original page image vs. rendered recreation of the user's own
  content. Chips name known differences (e.g. "Name font: closest match" when the
  font isn't embedded or isn't licensed to bundle).
- Feedback by text or voice → "Fix it" → new round. Max 3 rounds, then "Looks right
  · save template" or fall back to the ATS template.
- The saved template is reused for every application; only text changes. Overflow
  (tailored text longer than the original) must be handled by the template (allow a
  second page) rather than clipping.
- If the active text model cannot read images, the screen explains it and offers
  switching provider in Settings.

## 7. Design

- **Source of truth:** Figma file `zlMKsQIvGJ37axtpj8SZqb` ("منصة تتبع", 9 screens:
  Dashboard, Add application paste/review, Application job info/files, Cover letter,
  Reference, Email status, Profile). PNG exports of all 9 frames are in
  `docs/design/figma/` so the build never depends on Figma access. New screens as
  approved HTML mockups in `docs/design/mockups/`: `settings.html`,
  `new-screens.html` (CV Studio, Teach your design, First run, Empty dashboard),
  `letter-templates.html` (cover-letter layouts).
- **Tokens (from Figma):** bg `#f7f5ef`, surface `#fffdf9`, ink `#202329`, muted
  `#686b70`, soft border `#d9d7d0`, yellow `#ffe45b`, green `#cde8c6`, purple
  `#c9bbfa`, blue (saved) ≈`#bfdff0`, pink (rejected) ≈`#f6c9c0`; radius 7px;
  border 1.5px; hard shadow `3px 3px 0 #202329` (mirrored in RTL). Type: Space
  Grotesk Bold headings, Inter body, IBM Plex Mono labels, Noto Sans Arabic logo;
  Arabic UI uses IBM Plex Sans Arabic for body/labels.
- **Dark tokens (derived, approved via mockup):** bg `#15161a`, surface `#1e2026`,
  ink `#f1eee6`, muted `#9a9ca4`, soft `#363941`, strong border `#d9d5ca`, shadow
  `#000`; accent and pastel colours unchanged with dark text on them.
- **Sidebar order:** Dashboard, CV Studio (NEW badge), Cover Letter, Reference,
  Email Status, Profile, Settings.
- Must work at 1366×768 as well as 1440×900+.

## 8. Distribution (author's decision: no paid signing; ad-hoc sign the macOS build for free)

- Unsigned Windows installer → SmartScreen "Windows protected your PC" on first
  install (More info → Run anyway). Updates downloaded by the app usually don't
  trigger it.
- Unsigned macOS app → Gatekeeper blocks first launch. On macOS 15+ right-click →
  Open no longer bypasses it; users go to System Settings → Privacy & Security →
  Open Anyway. The app must be at least **ad-hoc signed** in CI, otherwise Apple
  Silicon can report it as "damaged" and the fix needs a terminal. No silent
  auto-update on macOS until signed (Apple Developer Program, ~$99/yr).
- Signing later: Windows via Azure Trusted Signing (~$10/mo) or an OV cert; macOS via
  Developer ID + notarization in the same GitHub Actions workflow.

## 9. Left to the builder

- Project layout, module boundaries, state management details, chart library,
  zip library, test framework (keep the reference's test spirit: AI tasks testable
  with recorded fixtures).
- Exact prompts, ported from `app/ai/tasks.py` and tightened per §6.1's rules.
- Whether renaming an application's company/title renames its folder (recommended:
  yes, with collision handling, skipped while a file in it is open).
- Default models per provider (choose current ones at build time).
- README / landing copy and screenshots for the GitHub release.
