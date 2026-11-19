# Tatabu (منصة تتبع) UI/UX audit

Date: 2026-11-19. Read-only audit, no project files changed.

**Method**
- Read every view under `src/renderer/src/views/**`, plus `components/ui/index.tsx`, `components/layout/*` and `styles.css`.
- Ran the renderer in the built-in browser preview (`tatabu-dev`, Vite on :5173) with the browser mock, using `?onboarded&demo` so it had 12 demo applications.
- Took measurements with `getBoundingClientRect` and `getComputedStyle`:
  - 1280x800, English and Arabic, light and dark;
  - 1024x768;
  - 1180x720, the real Electron minimum window (`src/main/index.ts:15-16`, minWidth 1180 / minHeight 720; default 1440x900).

All numbers below are CSS px measured in the live page unless marked "(code)".

**Caveats**
- `EmailView.tsx` and `AiKeysCard.tsx` are being edited by another engineer right now. Line numbers there may drift, and AiKeysCard was not reviewed in depth.
- The browser mock has no handler for `cv:get` / `cvs:get`, so I could not see the CV Studio preview filled in. Its sizes come from code.

---

## 1. Design tokens today

### 1.1 Global tokens (`src/renderer/src/styles.css`)

| Token | Value | Ref |
|---|---|---|
| Card radius `--radius-card` | 7px (used for cards, buttons, inputs, nav items, chips) | styles.css:68 |
| Border width `border-ui` | 1.5px | styles.css:75-77 |
| Hard shadow `shadow-hard` | 3px 3px 0 (x mirrored in RTL via `--sx`) | styles.css:19, 40-42, 71-73 |
| Body font size | 14px | styles.css:105 |
| `label-mono` (kickers, table headers, statuses) | 10px uppercase mono, muted; 11.5px in RTL | styles.css:80-92 |
| Focus ring | `:focus-visible { outline: 2px solid var(--ink); offset 2px }` (unlayered, so it beats Tailwind `outline-none`; checked with real keyboard Tab) | styles.css:128-131 |
| Spacing scale | none. Tailwind defaults plus many arbitrary values (`px-[19px]`, `px-[11px]`, `mb-[18px]`, `pt-[30px]`, `gap-[7px]`) | n/a |
| Type scale | none. **23 distinct arbitrary font sizes**: 9, 10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14, 15, 16, 18, 19, 20, 22, 24, 26, 27, 28, 34, 38, 40 px. Most common: 12.5px (86 uses), 12px (51), 13px (39), 11.5px (35) | repo-wide grep |
| Responsive breakpoints | **zero** `sm:/md:/lg:/xl:` classes in the whole renderer | repo-wide grep |

### 1.2 Primitives (`components/ui/index.tsx`)

| Primitive | Classes that set size | Ref |
|---|---|---|
| `Button` md | `h-[42px] px-3.5 text-[12.5px] gap-2`, icon 16px | ui/index.tsx:27 |
| `Button` sm | `h-8 px-2.5 text-[12px]` | ui/index.tsx:27 |
| `inputClass` (all inputs/selects) | `h-[42px] px-[11px] text-[12.5px]` | ui/index.tsx:37 |
| `FieldLabel` | `mt-4 mb-2 text-[12px] font-semibold`. One label + input = 18+8+42+16 = **84px per field row** | ui/index.tsx:48 |
| `Card` (Settings cards) | `px-[19px] py-5`; kicker `label-mono` "0N / LABEL"; title `mt-2.5 mb-1 font-head text-[19px]`; description `mb-[18px] text-[12.5px]` | ui/index.tsx:75, 80-87 |
| `Segmented` | `h-[38px] gap-2 text-[12.5px]` | ui/index.tsx:112, 123 |
| `Switch` | `h-6 w-11` | ui/index.tsx:145 |
| `Chip` | `h-[26px] px-[9px] text-[11.5px]` | ui/index.tsx:165 |

### 1.3 Layout chrome

| Element | Classes | Measured | Ref |
|---|---|---|---|
| Main content padding | `px-10 pt-[30px] pb-10` | 40px sides, 30px top | AppShell.tsx:35 |
| Sidebar | `w-60 px-5 pt-[25px]`, logo `text-[27px]`, `mt-12` before nav | 240px wide | Sidebar.tsx:31-35 |
| Sidebar nav item | `h-[46px] gap-3 text-[14px]`, icon 20px, list `gap-3` | 46px items, 58px pitch, 7 items = 406px | Sidebar.tsx:36, 46 |
| Sidebar position | not sticky (`min-h-full`, scrolls with the page) | nav disappears on scroll | Sidebar.tsx:31, AppShell.tsx:33 |
| PageHeader | crumb `label-mono 11px` + h1 `text-[38px] mt-3 mb-2.5` + sub `text-[15px]`, `mb-7`; toggles `size-11` (44px) | **109px** high (144px with Back link), so content starts at y=167 (y=202 with Back) | PageHeader.tsx:25, 37-39, 48, 57 |

### 1.4 Card / panel containers by screen (8 different local `Panel` copies)

| Screen / component | Padding | Title size | Gap between cards | Ref |
|---|---|---|---|---|
| Settings `Card` | 19px / 20px | 19px | gap-6 (24px) | ui/index.tsx:75, SettingsView.tsx:21-26 |
| Dashboard StatCard | px-5 py-4 (20/16), number `text-[40px]` | n/a | gap-5 (20px) | DashboardView.tsx:36-41, 325 |
| Dashboard donut / activity | px-6 py-5 (24/20) | 18px | gap-6 | DashboardView.tsx:55-56, ActivityChart.tsx:56-58 |
| Dashboard table toolbar / cells | toolbar px-5 py-4; th/td py-3 | 18px | n/a | DashboardView.tsx:140-141, 173-213 |
| Dashboard setup checklist | px-6 py-6 | 20px | gap-6 | DashboardView.tsx:234-236 |
| Dashboard empty hero | px-9 py-10 (36/40) | 40px | gap-6 | DashboardView.tsx:276-278 |
| Applications list item | px-4 py-3, pill on its own row (`mt-2.5`) | 13.5px | gap-2.5 | ApplicationsView.tsx:436-461 |
| Application detail | px-7 py-6 (28/24) | 28px | n/a | ApplicationsView.tsx:302, 316 |
| Add application `Panel` | px-6 py-6 | 24px | gap-6 | AddApplicationView.tsx:86, 217, 276 |
| Add side cards | px-6 py-6 / px-5 py-5 | 27px / 20px / 16px | gap-6 | AddApplicationView.tsx:386-406, 410-472 |
| Add stepper | `h-[62px] px-4` | 14px | mb-6 | AddApplicationView.tsx:70 |
| CV Studio `Panel` | px-5 py-5 | (kicker only) | gap-5 | CvStudioView.tsx:42, 413 |
| Cover letter `Panel` | px-5 py-5 | n/a | gap-6 | CoverLetterView.tsx:40 |
| Email `Panel` | px-6 py-6 | 24px | gap-6 | EmailView.tsx:18, 105, 148 |
| Reference sections | px-5 py-5 | 16px (referee) | gap-6 | ReferenceView.tsx:209, 295 |
| Profile `Panel` | px-5 py-5 | 22px | gap-6 | ProfileView.tsx:32-33 |
| Master CV section / empty | px-5 py-5 / px-8 py-9 | n/a | n/a | MasterCvView.tsx:43, 126 |
| Teach design | px-6 py-6 / px-5 / px-4 | 24px | gap-5 | TeachDesignView.tsx:232-349 |
| Onboarding StepCard | px-[19px] py-5, `min-h-[330px]`, number 34px | 19px | gap-5 | OnboardingView.tsx:15-22 |

Summary: across the app, cards use five padding values (16/20/24/28/36-40px) and eight title sizes (16/18/19/20/22/24/27/28px). Every screen draws its own "panel". All of them sit at the large end for a desktop productivity tool.

---

## 2. Card size findings (with proposed values)

### Why everything feels big: the shared inflation

1. **Chrome uses about 170px before any content.** Header is 109px + 28px margin + 30px top padding = content starts at **y=167**, or y=202 on pages with Back.
   - A 38px h1 and a 15px subtitle repeat on every screen, alongside a crumb and a sidebar that already say where you are.
2. **Controls are 42px tall** (inputs and buttons), and every field adds 16px top + 8px label gap. That is 84px per form row. Desktop productivity apps use 28-36px controls and 56-64px field rows.
3. **Cards have 20-28px padding, 19-28px titles, and a mono kicker above the title** ("01 / AI KEYS"). So 90-170px goes by before the first control in a card (Settings, measured below).
4. **Gaps between cards are 24px**, against 16px or less in comparable tools.
5. **Explainer and marketing cards sit inside working screens.** Purple "How it works", "Local by default", "Always your call", "Yours. Not the cloud", "Saved on this device", "only source of facts". They take card-sized space and repeat the same privacy message 5+ times.
6. **Nothing adapts.** No breakpoints and fixed side columns (320/330/340/344/360/400/420/500px). At smaller windows cards just get taller as text wraps.

### Global proposal (applies everywhere)

| Item | Now | Proposed |
|---|---|---|
| Main padding | `px-10 pt-[30px] pb-10` (AppShell.tsx:35) | `px-6 pt-5 pb-8` |
| PageHeader h1 | 38px, crumb + 15px subtitle, `mb-7`, total 109px | h1 `text-2xl` (24px) with the subtitle inline or removed; drop the crumb (sidebar already shows location); `mb-5`. Target **≈48-56px** |
| Header toggles (lang/theme) | `size-11` (44px), on every page | `size-8` (32px); better, move them into the sidebar footer once |
| Sidebar width / items | 240px; items 46px with 12px gap; logo 27px; `mt-12` | 208-220px; items `h-9` (36px) with `gap-0.5`; logo 20px; `mt-6`. Nav block 406px → **≈260px** |
| `Card` padding | 19/20px | `p-4` (16px); dense variant `p-3` |
| Card title | 19-28px (eight sizes) | one card-title style: 15-16px semibold. Use 18px only for the main entity title (e.g. a job) |
| Card kicker "0N / LABEL" | above every Settings/CV/Letter/Email card | remove. The numbers add nothing on non-wizard screens |
| Card description | 12.5px, `mb-[18px]` | 12px, `mb-3`, one line where possible |
| Gap between cards | `gap-6` (24px) / `gap-5` | `gap-4` (16px) for columns, `gap-3` inside a column |
| Inputs / buttons md | 42px | **36px** (`h-9`); `sm` = 30px for table and toolbar controls |
| FieldLabel | `mt-4 mb-2` (84px row) | `mt-3 mb-1.5` with 36px input, so **≈66px row** (-21%) |
| Segmented | 38px | 32px |

### 2.1 Dashboard (`views/dashboard/DashboardView.tsx`, `ActivityChart.tsx`)

**Measured (1280x800)**
- Stat cards: **221 x 127px each**, padding 16/20. The number is 40px. At 1024 the notes wrap and cards grow to 145px.
- Donut and activity cards: **309px tall**. Donut SVG is 148px; chart area `h-[132px]` plus an always-on hover-hint row (`h-6`).
- Applications table starts at **y=651**; first data row at **y=766**.
- Rows are **63px** each: two-line company/role cell with `py-3`.
- Visible rows: **0** at 1280x800 and **0** at the 1180x720 Electron minimum, about 2 at the default 1440x900.
- The table, which is the main working surface, sits under about 600px of summary tiles.

**Why it feels big:** a 40px number and three stacked text lines on a pastel tile; two chart cards at 309px; table rows twice the height of a typical data table.

**Proposed**
- **Stat card 127px → ~76px**:
  - `px-5 py-4` → `px-4 py-3`;
  - number `text-[40px]` → `text-[28px]`, `mt-3` → `mt-1`;
  - note at 11.5px, kept to one line;
  - grid `gap-5` → `gap-3` (DashboardView.tsx:36-41, 325).
  - Alternative: put label and note on the left, number on the right, for a ~60px tile.
- **Charts 309px → ~200-220px**:
  - section `px-6 py-5` → `p-4`;
  - donut SVG 148 → 112, `gap-7` → `gap-4` (DashboardView.tsx:55-58);
  - chart `h-[132px]` → `h-24` (96px) (ActivityChart.tsx:126);
  - replace the fixed hover-hint row with a tooltip, or show the hint inside the range row.
  - Consider making the whole chart row collapsible, or moving it below the table.
- **Table**:
  - toolbar `px-5 py-4` → `px-4 py-2.5`; controls 38 (really 42, see Issue 4) → 32px;
  - th `py-3` → `py-2`; td `py-3` → `py-2`;
  - put company and role on one line ("Nordlicht GmbH · Frontend Engineer", role muted), or keep two lines at 12px with `leading-tight`.
  - Row 63px → **40-44px**.
- **Net effect:** first row moves from y=766 to about **y≈470**, so **7-8 rows** are visible at 1280x800 and ~5 at 1180x720.
- **Empty dashboard:**
  - hero card is 536x343 with padding 40/36 and a 40px title;
  - setup checklist is 450px tall (each item ~56px with 12px gaps);
  - proposed: hero `px-9 py-10` → `p-6`, title 40 → 28px; checklist items `py-3` → `py-2`, `gap-3` → `gap-2`.

### 2.2 Applications list + detail (`views/applications/ApplicationsView.tsx`)

**Measured**
- List items: **320 x 100px**, padding 12/16. The status pill sits on its own row (`mt-2.5`). Gap 10px. About **5** items fit on screen.
- Empty detail placeholder: `min-h-[320px]`, dashed.
- Detail card: padding **24/28**, about **1,240px tall** for one application:
  - 28px title;
  - five 38px link buttons in two rows;
  - tabs;
  - 10 fields in a 2-column grid, each with its own 34px copy button;
  - 9-row description textarea (216px);
  - delete bar `mt-8`.
- The first editable field is **361px below the card top**.

**Why it feels big:** list rows are three-line cards instead of a list; the detail header (company / 28px title / meta / 40px status select / button rows) is about 270px; copy buttons double the visual weight of every field.

**Proposed**
- List item 100 → **56-60px**:
  - `py-3` → `py-2`;
  - pill inline at the row end (or a coloured 8px dot plus status text), not on its own line;
  - `gap-2.5` → `gap-1`, or one bordered list with dividers instead of separate cards (ApplicationsView.tsx:436-461).
- Detail:
  - `px-7 py-6` → `p-5`; h2 28 → 20px (ApplicationsView.tsx:302, 316);
  - action buttons `h-[38px]` → `h-8` (32px), in one wrapping row;
  - `InlineField` label `mt-4` → `mt-3`, input 36px;
  - move the copy button inside the input as an end-adornment that shows on hover/focus.
  - Description `rows={9}` → `rows={6}`; notes `rows={14}` → `rows={10}`.
  - Target detail ≈ **800px**, first field at ≈200px.

### 2.3 Add application (`views/applications/AddApplicationView.tsx`)

**Measured**
- Header (with Back) 144px + stepper **62px** → content at **y=288**.
- Step 1 panel: 577 x 632, padding 24, title 24px, textarea 258px (`rows=11`, `min-h-[240px]`). The primary **Extract** button is at **y≈870**, below the fold at 800px.
- Side: purple "How it works" **344 x 422** (27px headline, `mt-7` list with `gap-6`) and "Local by default" 344 x 110.
- Step 2 form: 577 x 912. 11 fields at about 84px per row; **Save at y=1108**.

**Proposed**
- Remove the "01 / 02" counter in the header (AddApplicationView.tsx:207). It duplicates the stepper.
- Shrink the stepper to a 36-40px inline row, or fold it into the header (AddApplicationView.tsx:70).
- Panel `p-6` → `p-5`; h2 24 → 18px; textarea `rows=11 / min-h-240` → `rows=8 / min-h-[180px]`. Extract then lands at ≈y 600 at 1280x800.
- Purple explainer: replace the 422px card with a 3-line hint under the textarea, or a collapsible "How it works". Drop "Local by default"; the sidebar already says it.
- Step 2: 36px inputs and 66px field rows bring the form to ≈720px. Better still, make the action row sticky at the bottom of the panel.

### 2.4 CV Studio (`views/cv/CvStudioView.tsx`)

**Measured**
- Left column (330px wide) is **four stacked cards: 219 + 272 + 128 + 260 = 939px** plus gaps.
- The primary **Tailor my CV** button is at **y=1043**.
- The right preview card is only 414px tall while loading (in the mock it stays on the spinner, see Issue 7).
- Look thumbnails are `h-[74px]` inside `p-2.5` buttons.

**Proposed**
- Merge "Pick the job" + "Choose the look" + "Highlight" into **one settings card** with hairline dividers, `p-4`, no kickers.
- Turn the "grounded / no master CV" card (CvStudioView.tsx:486-504) into a 1-line inline notice (~36px).
- Thumbnails 74 → 48px.
- Make the Tailor button sticky at the bottom of the left column, or put it in the right card's header next to "Save as PDF".
- Target: left column ≤ 600px, with Tailor visible without scrolling at 1280x800.

### 2.5 Cover letter (`views/letter/CoverLetterView.tsx`)

**Measured**
- Left column: four cards, **302 + 128 + 253 + 167px**. "Write cover letter" at **y=1013**.
- Right editor card: **581 x 1096px**:
  - 4 layout thumbnails (`max-h-[118px]` previews);
  - subject + address row;
  - letter textarea `rows=18 / min-h-[360px]`.
  - "Save as PDF" at **y=1200**.

**Proposed**
- Same consolidation as CV Studio.
- Layout picker: 4 thumbnails 118px → a compact segmented control with 48px mini thumbnails, or a dropdown.
- Letter textarea `min-h-[360px]` is fine, but move the PDF/save actions into a sticky footer or the card header.

### 2.6 Email status (`views/email/EmailView.tsx`)

**Measured**
- Two panels **461 x 628px** each, padding 24, title 24px, textarea `min-h-[360px]`.
- The empty right panel uses 628px to show two lines of text.
- Bottom purple "Always your call" banner: **945 x 133px**.

**Proposed**
- Panel `p-6` → `p-5`; titles 24 → 18px; textarea min-h 360 → 260.
- Remove the bottom banner (EmailView.tsx:238-242), or reduce it to one muted line under the Analyze button.
- Result: page height ~991 → ~700, fully visible at 800px.

### 2.7 Reference (`views/reference/ReferenceView.tsx`)

**Measured, 1280:** form card 421 x 426; preview card 500 x 658 (sticky, purple, preview `max-h-[62vh]`).

**Measured, 1180 (Electron minimum):** form card shrinks to **321px**. The application picker shows only "Nordli…" and the title input shows "Refer…" (screenshot 18). Cause: fixed `minmax(0,500px)` preview plus an inner `180px` language column and a `w-[210px]` suggestion select (ReferenceView.tsx:208, 211, 244).

**Proposed**
- Preview column `minmax(0,500px)` → `minmax(360px,0.9fr)`.
- Inner grid: stack application and language vertically below about 400px, or drop the fixed 180/210px widths.
- Collapsed referee row: 16px name, ~70px → 13.5px name, ~52px.

### 2.8 Profile (`views/profile/ProfileView.tsx`)

**Measured**
- Details card 501 x 373 for 6 fields: about 62px of height per field, which is fine.
- Master CV card **501 x 250** for one green banner, one status line and one link button.
- Signature 420 x 259.
- Library card 420 x 348 while empty.

**Proposed**
- Panel title 22 → 16px (ProfileView.tsx:33).
- Master CV card → a single row, "No CV imported yet · [Open master CV]", ≈90px. Drop the green "only source of facts" banner (ProfileView.tsx:238-241).
- Library: hide the "Document name" field until a file is picked, and use a ~120px empty state.

### 2.9 Settings (`views/settings/*`)

**Measured** (card height / offset of the first control from the card top):

| Card | Height | First control at |
|---|---|---|
| AI keys | 324 | 159 |
| Referees | 265 | 133 |
| Appearance | 336 | 117 |
| Languages | 234 | 133 |
| Storage | **477** | 169 |
| About | 196 | 92 |

- So **92-169px of every card is header** before anything you can change.
- About is 196px for a version string and one button.
- Columns are unbalanced: left ends at 779px, right at 1481px, leaving **~700px of blank left column** (screenshot 14).
- A permanent green "All changes saved on this device" bar (945 x 44) sits at the bottom.

**Proposed**
- Drop the kicker; title 19 → 15px; description one line, `mb-3`. First control at ≈60px (saves 40-100px per card).
- Appearance: label-left / control-right rows (120px label column, 32px segmented). 336 → ≈170px.
- About: a single row "Version 1.0.0 · Up to date [Check]". 196 → ≈56px.
- Storage: merge the two dashed info boxes into helper text. 477 → ≈300px.
- Rebalance: move Storage (or Languages + About) into the left column, or use a single 760px column of sections.
- Remove the static saved bar (SettingsView.tsx:33-36). It is not tied to any save event, and toasts already confirm saves.

### 2.10 Onboarding (`views/OnboardingView.tsx`)

`min-h-[330px]` step cards with 34px numbers. This is a one-time screen and the generous sizing is acceptable here. Optional: `min-h` → auto, number 34 → 24px.

---

## 3. Other UI/UX issues

| # | Sev | Screen | Ref | Problem | Fix |
|---|---|---|---|---|---|
| 1 | **High** | All | Sidebar.tsx:31, AppShell.tsx:33-35 | **Sidebar scrolls away.** The aside is `min-h-full` inside a page-scrolling flex. On any scrolled page (dashboard table, settings, add step 2) the nav items leave the screen and only the privacy card stays at the bottom (screenshots 03, 14). | `sticky top-0 h-screen overflow-y-auto` on the aside. Or make `main` the scroll container (`h-screen overflow-hidden` on the shell, `overflow-y-auto` on main) and update `window.scrollTo` in AppShell.tsx:17 to scroll `main`. |
| 2 | **High** | Reference, CV, Letter, Add, Profile | ReferenceView.tsx:208-244; CvStudioView.tsx:412; CoverLetterView.tsx:429; AddApplicationView.tsx:214; ProfileView.tsx:175 | **No responsive behaviour at all** (0 breakpoints), with fixed side columns (320-500px). At the Electron minimum of 1180px, Reference inputs are truncated to "Nordli…" / "Refer…". At 1024 the dashboard donut legend counts are clipped (screenshot 17). | Use `minmax(Npx, …)` with sensible minimums, add `xl:` variants to stack below about 1280, and drop fixed inner widths. |
| 3 | **High** | Dashboard, Add, CV, Letter | figures in §2 | **Primary actions and content sit below the fold** at common sizes: Extract y=870; Save y=1108; Tailor y=1043; Write letter y=1013; Save PDF y=1200; first table row y=766 (0 rows visible at 1180x720). | Compress per §2. Put primary actions in sticky action bars or the page header. |
| 4 | Med | Dashboard toolbar, Application detail | DashboardView.tsx:150, 158; ApplicationsView.tsx:85, 120, 142 | **Class overrides fail silently.** `clsx(inputClass, 'h-[38px]')` still renders **42px** (measured), because `inputClass` has `h-[42px]` and there is no tailwind-merge. ApplicationsView.tsx:338 had to use `!h-[38px]`. | Add `tailwind-merge` (`cn = (...a) => twMerge(clsx(a))`) in `components/ui`, or give inputs a `size` prop. |
| 5 | Med | All | 8 local `Panel`s, see §1.4 | **No single card primitive.** 5 paddings, 8 title sizes, kicker vs no kicker, `border-strong` vs `border-paper-ink`. Each screen looks slightly different, and the "too big" feel can't be fixed in one place. | Extend `Card` in ui/index.tsx with `size="sm|md"`, `tone`, optional `kicker` / `actions`, and replace the local Panels (CvStudioView.tsx:40, CoverLetterView.tsx:40, EmailView.tsx:16, ProfileView.tsx:20, AddApplicationView.tsx:85, plus inline sections). |
| 6 | Med | All | repo-wide | **No type scale**: 23 distinct pixel sizes, with half-pixel steps (10.5/11.5/12.5/13.5) next to each other. | Define about 7 steps in `@theme` (e.g. 11 / 12 / 13 / 14 / 16 / 20 / 28) and map the current sizes onto them. |
| 7 | Med | CV Studio | CvStudioView.tsx:200, 586-589 | **Infinite spinner on load failure.** `!draft \|\| !masterState` shows a spinner forever when `cv:get` rejects (seen in the browser mock, which has no `cv:get` handler: browserMock.ts:177). No error text, no retry. | Add an error branch with a message and a Retry button (use `isError` from the query). Also add `cv:get` / `cvs:get` mocks in browserMockDesign.ts so the screen can be audited in a browser. |
| 8 | Med | Dashboard, Applications, Files | DashboardView.tsx:316; ApplicationsView.tsx:436-469; FilesTab.tsx:69 | **Loading states are blank.** The dashboard renders only the header while pending, then the whole layout jumps in. The list and files tab render nothing. | Skeleton tiles and rows with fixed heights. |
| 9 | Med | Settings | SettingsView.tsx:33-36 | The static green **"All changes saved"** bar is always visible. It looks like status but isn't one. | Remove it. Rely on the existing toasts, or show it only briefly after a write. |
| 10 | Med | Settings | SettingsView.tsx:21-31 | **Column imbalance**: ~700px of empty left column. | Rebalance cards, or use a single column. |
| 11 | Med | Add, Email, Profile, CV, Letter, Sidebar, headers | AddApplicationView.tsx:386-406, 469-472; EmailView.tsx:238-242; ProfileView.tsx:238-241, 254; Sidebar.tsx:64-70; CvStudioView.tsx:411 | **Repeated reassurance and marketing blocks** take card-sized space. The privacy / local / "only source" message appears 5+ times. | Keep it once (sidebar footer, one line). Turn the others into dismissible hints. |
| 12 | Med | Add | AddApplicationView.tsx:62-83, 207 | **Three step indicators** (crumb, "01 / 02" header counter, 62px stepper). | Keep one compact stepper. |
| 13 | Med | Application detail | ApplicationsView.tsx:21-41, 88 | **10 always-visible copy buttons** (34px each) beside the fields, plus one for the description. Visual noise. | In-field copy adornment shown on hover/focus. |
| 14 | Med | Applications list | ApplicationsView.tsx:436-461 | 100px list items: only about 5 visible. | 56-60px rows, see §2.2. |
| 15 | Low | Navigation | Sidebar.tsx:13-21 | **"Applications" has no nav item.** It is reachable only via dashboard rows, the Back button, or after saving, and the Dashboard item lights up instead. | Add an "Applications" item, or a nested sub-item under Dashboard. |
| 16 | Low | Copy | en.json:10-11, 43-45, 496 | Naming is inconsistent. Nav "Reference" vs page title "References"; "Save PDF" (docs.printPdf) vs "Save as PDF" (CV and letter); nav "Email Status" vs page "Email status". | Pick one term per concept. |
| 17 | Low | Small targets | RequirementsEditor.tsx:44 (16px ×); LanguagesCard.tsx:45 (14px icon, no padding); ApplicationsView.tsx:307 (18px close link, no padding); ActivityChart.tsx:86-98 (28px); ReferencesCard.tsx:94 (28px) | Several icon buttons are 14-18px hit areas. | Minimum 24px (WCAG 2.2 AA); aim for 28-32px with padding. |
| 18 | Low | Typography | styles.css:80-92 | `label-mono` at **10px** uppercase is used for meaningful text: table headers, "Saving…/Saved", kickers, word counts, model lines (often with `!text-[10px]`). It is legible but at the floor. | 11px minimum for table headers and status text. Remove decorative kickers. |
| 19 | Low | Colours | DashboardView.tsx:114; ReferencesCard.tsx:172; ReferenceView.tsx:70; many `#4a4560`, `#4a4a4a`, `#fffdf9`, `#e4e1d8` | Hard-coded colours bypass the tokens. **Three different "danger" reds** (#b3261e, #a3352a, #c2410c orange for deadlines). | Add `--danger`, `--warning`, `--on-pastel-muted` tokens (light and dark). |
| 20 | Low | Dark mode | styles.css:28-38; stat cards and purple panels | Accent fills (`--yellow/green/purple/blue/pink`) are not redefined for dark, so full-strength pastels on #15161a are glaring (screenshot 19). | Dark variants, e.g. `color-mix(in srgb, var(--purple) 35%, var(--surface))`, with light text. Or keep pastels only for small chips. |
| 21 | Low | Destructive actions | CvStudioView.tsx:667; CoverLetterView.tsx:762; TeachDesignView.tsx:261; MasterCvView.tsx:270, 678; ProfileView.tsx:96-110; ReferencesCard.tsx:170-177 | Four different confirm patterns:<br>- native `window.confirm` (unstyled, ignores theme and RTL);<br>- inline pink confirm (application delete: good);<br>- click-twice ghost text (referee);<br>- **immediate delete with no confirm or undo** (library item, which goes to system trash with only a toast). | One styled confirm popover / inline pattern, or toast-with-Undo for reversible deletes. |
| 22 | Low | Profile, Settings header | ProfileView.tsx:165-170 | When nothing is dirty, the header shows a **disabled yellow primary "Saved" button**. It reads as a broken CTA. | Show quiet status text ("All saved ✓") and only show the primary button when dirty. |
| 23 | Low | RTL | AddApplicationView.tsx:197-198; OnboardingView.tsx:52 | Arrow direction is picked by `prefs.language === 'ar'` instead of document direction. It works today but breaks if another RTL UI language is added. Other screens correctly use `rtl:rotate-180`. | Use `rtl:rotate-180` / `rtl:-scale-x-100` consistently. |
| 24 | Low | Window | src/main/index.ts:15-16 (main process, not renderer) | minHeight 720 combined with ~170px of chrome means the data-heavy screens show almost no content at the minimum size. | After compression, 720 is fine. Until then, the minimum window is effectively unusable for the dashboard. |
| 25 | Low | Activity chart a11y | ActivityChart.tsx:146 | Bars use `outline-none`. Focus still shows, because the unlayered global `:focus-visible` wins, but only by accident of cascade order. | Remove `outline-none` there so intent matches behaviour. |

**What is already good**
- **RTL**: logical properties are used everywhere. I found zero physical `ml-/mr-/pl-/pr-/left-/right-/text-left/right` classes. The hard shadow is mirrored via `--sx`, icons use `rtl:rotate-180`, user text uses `dir="auto"` with interface-aligned start, and Arabic label-mono is bumped to 11.5px. In the Arabic screenshots (15, 16) layout, sidebar, table and pills all mirror correctly.
- **Keyboard focus**: a 2px ink outline on `:focus-visible`, verified with a real Tab press on the Reference screen.
- **Contrast**: muted #686b70 on #f7f5ef ≈ 4.9:1; dark #9a9ca4 on #1e2026 ≈ 6:1; ink on pastels is high. All pass AA.
- **Empty states exist** for the dashboard (hero + checklist), the applications detail, email, the reference referee list and library. They are just oversized.
- **Visual identity**: hard-edged and consistent.

---

## 4. Quick wins (do these first)

1. **Make the sidebar sticky** (Sidebar.tsx:31): `sticky top-0 h-screen overflow-y-auto`. One line; fixes navigation on every long page.
2. **Shrink the PageHeader** (PageHeader.tsx:25-39): h1 38 → 24px, crumb removed, subtitle 13px inline or removed, `mb-7` → `mb-5`, toggles 44 → 32px. Main padding `px-10 pt-[30px]` → `px-6 pt-5` (AppShell.tsx:35). About **100px gained on every screen**.
3. **Global control height 42 → 36px** (ui/index.tsx:27, 37) and **FieldLabel `mt-4 mb-2` → `mt-3 mb-1.5`** (ui/index.tsx:48). Every form gets ~20% shorter.
4. **Card primitive diet** (ui/index.tsx:75-87): `p-4`, no "0N / LABEL" kicker, title 15-16px, description `mb-3`. Settings cards get 40-100px shorter each. Then point the local Panels at it.
5. **Dashboard compaction**:
   - stat tiles 127 → ~76px (number 28px, `py-3`, `gap-3`);
   - chart cards 309 → ~210px (donut 112px, chart 96px);
   - table rows 63 → 44px (`py-2`, one-line company · role).
   - About 7 rows visible instead of 0.
6. **Remove the duplicated reassurance blocks**:
   - Settings "saved" bar;
   - Email bottom banner;
   - Add "Local by default" card;
   - collapse Add "How it works" (422px) into a short hint;
   - Profile green banner.
7. **Add `tailwind-merge`** so size overrides like `h-[38px]` actually apply. It also makes the compaction work above safer.
8. **Fix the Reference column widths at 1180px** (ReferenceView.tsx:208, 211, 244), and add an error state to the CV Studio loader (CvStudioView.tsx:586).

---

## 5. Screenshots saved

All in `C:\Users\Wael\AppData\Local\Temp\claude\8c2247e6811e3895\6b797467-b64c-4f0c-9fb7-2292d80e0f86\scratchpad\research\screens\`. Captured as 800px-wide downscales of the 1280/1024/1180 viewports:

| File | Shows |
|---|---|
| 01-onboarding-dark-1280.jpg | Welcome screen (dark) |
| 02-dashboard-en-light-1280.jpg | Dashboard: 127px stat tiles, 309px charts, table starting at the fold |
| 03-dashboard-scrolled-sidebar-nav-gone.jpg | Scrolled dashboard: sidebar nav gone (Issue 1); 63px rows |
| 04-applications-list-empty-detail.jpg | 100px list items, 320px empty detail |
| 05-application-detail-en.jpg | Detail header, button rows, copy buttons |
| 06-add-application-step1.jpg | Stepper + 422px purple explainer, Extract below the fold |
| 07-add-application-step2.jpg | 84px field rows |
| 08-cv-studio-stuck-spinner.jpg | Four stacked left cards; preview stuck on spinner (mock) |
| 09-cover-letter.jpg | Left card stack, large editor card |
| 10-email-status.jpg | Two 628px panels, mostly empty |
| 11-reference-1280.jpg | Reference at 1280 |
| 12-profile.jpg | Profile |
| 13-settings-top.jpg | Settings card headers (kicker + 19px title + description) |
| 14-settings-scrolled-empty-left-column.jpg | 700px empty left column, static saved bar, nav gone |
| 15-dashboard-ar-rtl.jpg | Arabic RTL dashboard (correct mirroring) |
| 16-application-detail-ar-rtl.jpg | Arabic RTL application detail |
| 17-dashboard-1024-legend-clipped.jpg | 1024px: legend counts clipped, tiles 145px |
| 18-reference-1180-fields-truncated.jpg | 1180px (Electron minimum): "Nordli…" / "Refer…" truncation |
| 19-dashboard-dark.jpg | Dark mode: glaring pastel tiles |
| 20-dashboard-empty-state.jpg | Empty dashboard hero + checklist |

The preview server was stopped at the end of the audit, and the viewport emulation was reset.
