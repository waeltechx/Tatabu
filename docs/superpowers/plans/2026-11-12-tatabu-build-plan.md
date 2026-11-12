# Tatabu — build plan

Spec: `docs/superpowers/specs/2026-11-12-job-tracker-desktop-design.md` (approved 2026-11-12).
Reference (read-only): the author's original single-user tracker `job-tracker` (local, not in this repo).

Each phase ends with something runnable and a check. Phases are in dependency order;
a later phase never needs to reopen an earlier one's design.

Toolchain on this machine: Node 24.16, npm 12, git 2.54. Current versions at plan
time: electron 45.3, electron-builder 26.18.

**Builder's call (deviation from spec §5, reason given):** use Electron's built-in
`node:sqlite` instead of better-sqlite3 — no native module to rebuild per OS/arch, which
keeps the universal macOS build and CI simple. If it turns out insufficient, switch to
better-sqlite3 behind the same repository layer.

---

## Phase 0 — Foundation

1. `git init`, `.gitignore` (node_modules, out, dist, release, `.superpowers/`, `.env*`),
   remote `https://github.com/waeltechx/Tatabu`.
2. Scaffold Electron + Vite + React + TypeScript (electron-vite layout):
   `src/main` (main process), `src/preload` (typed bridge), `src/renderer` (React),
   `src/shared` (types, zod schemas, IPC contract).
3. Tailwind with the spec §7 tokens as CSS variables (light + dark), logical
   properties, RTL shadow mirroring; fonts bundled under `src/renderer/assets/fonts`.
4. i18n (react-i18next) with `en` and `ar`, `dir` switching; theme light/dark/system.
5. Typed IPC: one contract file → `ipcMain.handle` registrations + preload
   `window.tatabu.*` API. Security: contextIsolation on, sandbox on, no nodeIntegration,
   CSP.
6. App shell: sidebar (7 items), page header, router, toasts — matching Figma.
7. Export the 9 Figma frames (PNG + design context) to `docs/design/`; copy approved
   mockups there too.
8. electron-builder config: appId `com.waeltechx.tatabu`, productName `Tatabu`,
   Windows NSIS (x64), macOS universal dmg with ad-hoc signing (`identity: "-"`),
   GitHub publish provider. GitHub Actions `release.yml` on tag `v*` (windows-latest +
   macos-latest) → draft release; `ci.yml` on push runs typecheck + tests.

**Check:** `npm run dev` opens the shell; language and theme toggles work; `npm run
build:win` produces a working `Setup.exe` locally; CI workflow passes on a test tag.

## Phase 1 — Data, storage, settings

1. SQLite in `userData`, migrations with `schema_version`, DB backup before migrating.
   Tables: applications, files, library_files, profile, settings, referees,
   application_referees (overrides), cv_master, cv_templates, documents (generated
   CV/letter/reference records), letter_prefs (layout per language), languages.
2. Documents folder (`Documents/Tatabu` default): create, change (move with confirm),
   per-application folder `Company – Job title` with sanitising + collision suffix,
   rename on edit, `_Library/`, "Open folder" via `shell.openPath`.
3. Secrets via `safeStorage`; never logged; masked in UI.
4. Settings screen (mockup `settings.html`) wired to storage, minus AI tests (Phase 2).
5. First-run flow (language/theme, key placeholder, CV upload placeholder).

**Check:** unit tests for migrations, folder naming/collisions, settings round-trip;
manual: change data folder and see files move; keys survive restart and are not
readable in the DB file.

## Phase 2 — AI layer + voice

1. Provider registry: groq, gemini, openai, openrouter (OpenAI-compatible base URLs).
2. Roles: `text` (Groq or alternative), `voice` (Groq Whisper), `vision` (vision-capable
   model of the active text provider, picked from `/models`).
3. Structured output: zod → JSON Schema; degrade json_schema → json_object → prompt;
   validate + one repair retry (port `app/ai/client.py` behaviour).
4. Errors: plain message + Retry; "Try with <other provider>" when configured; no silent
   failover.
5. Settings: Test buttons, model dropdown from `/models`, vision probe chip.
6. Mic button component → record (webm) → Groq transcription → insert text.

**Check:** tests with recorded fixtures for schema degrade/repair; manual with a real
Groq key: test connection, transcribe Arabic and English.

## Phase 3 — Applications core

1. Port `JobExtraction` schema (language becomes a free code) and `parse_job_page`.
2. Add application: paste or dictate → extract → review → save (Figma screens 02/03).
3. Duplicate detection: port all signals from `app/duplicates.py` plus its tests from
   `tests/`.
4. Dashboard (screen 01): stat cards, status donut, 14-day chart, table with search +
   status filter; empty state + setup checklist (mockup).
5. Application detail (screens 04/05): job info inline edit + copy, notes, status,
   files (upload, attach from library, combine to PDF with pdf-lib, delete), open
   folder, delete application (optionally trash folder).

**Check:** ported duplicate tests pass; manual: add 3 postings (EN, DE, AR), detect a
re-paste as duplicate, combine files into one PDF.

## Phase 4 — Document engine, profile, references

1. Renderer service: HTML template → hidden BrowserWindow → `printToPDF` (A4/Letter),
   fonts embedded, RTL verified.
2. Profile screen (screen 09): header details, links, signature pad, library.
3. Referees in Settings + per-application overrides; References PDF (screen 07) with
   the job title as subject.

**Check:** References PDF in English and Arabic opens correctly and text is selectable.

## Phase 5 — Master CV + shared verifier

1. Upload CV (PDF via pdfjs-dist text, DOCX via mammoth) → AI → structured master
   record; review/edit screen for the master record.
2. Verifier (pure code, unit-tested): source attribution per item, number/date
   normalisation (Arabic-Indic digits, month names, formats), declared
   translations/transliterations, output = warnings list.
3. Warning UI component: list with **Show me** (scroll + highlight in editor/preview)
   and **Fix it** (AI rewrites that item from cited sources); dismiss keeps text.
   Never blocks saving.

**Check:** verifier tests including translated EN→AR cases and planted fake facts.

## Phase 6 — Cover letter

1. Port prepare (subjects + questions), generate, prompt-copy from `app/ai/tasks.py`;
   tighten rules; ground in the master record; run verifier → warnings.
2. Languages: English, العربية, added languages; multi-language generation.
3. The seven layouts (mockup `letter-templates.html`) with per-language labels/date
   format; layout remembered per language; thumbnail picker.
4. Editor, word count, recipient, subject choice, enclosures, signature, save PDF to
   the application folder (screen 06 updated).

**Check:** generate EN, DE, AR letters for one application in each family of layouts;
plant a fake claim and see the warning + Show me.

## Phase 7 — CV Studio

1. Tailor: application + language + look + highlight → tailored structured CV + change
   list (rewritten/reordered/reworded/left out, old/new, source) + "not in your CV"
   requirements.
2. Verifier warnings as in Phase 5.
3. ATS template LTR + RTL.
4. Review UI (mockup): preview with highlights, accept/reject per change, undo all,
   save PDF, open folder.

**Check:** tailored EN and AR CVs from one master; ATS PDF text extracts cleanly in
order (copy-paste test).

## Phase 8 — Teach your design

1. Render uploaded PDF pages to PNG (pdfjs) + extract images/photo.
2. Vision model → HTML/CSS template with placeholders bound to master-record fields;
   repeating blocks; overflow to a second page.
3. Compare screen (mockup): original vs recreation, difference chips, feedback by
   text/voice, max 3 rounds, save or fall back to ATS.
4. "My design" option in CV Studio uses the saved template.

**Check:** two very different sample CV PDFs (one two-column with photo, one
single-column Arabic) produce acceptable templates within 3 rounds.

## Phase 9 — Email status, backup, updates

1. Port email analysis (screen 08) with confirm step.
2. Backup export (DB + documents folder → .zip) and restore.
3. electron-updater: quiet check on launch, banner, Windows download + install on
   restart; macOS banner opens the release `.dmg` URL.

**Check:** restore a backup into a fresh user profile; publish a test pre-release and
see the update banner on an older installed build.

## Phase 10 — Release

1. README in English + Arabic: download, first install on Windows (SmartScreen) and
   macOS (Open Anyway), getting a Groq key, privacy statement.
2. Polish pass at 1366×768 and 1440×900, both themes, both directions.
3. Tag `v1.0.0` → CI builds → test the Windows installer on this machine; macOS build
   checked via CI artifacts (no local Mac — note this limitation in the release).
4. Publish the release.

---

## Working rules

- Never modify the reference project; read and port only.
- No personal data in the repo: no real CVs, keys or applications in fixtures —
  fixtures are invented.
- Each phase: typecheck + tests green before moving on.
