# Vidhi — Roadmap & Progress

> **Last updated:** 2026-05-08 (after PR #4 merged)
> **Live deploys:** [Frontend](https://mini-harvey.netlify.app) · [Backend](https://miniharvery.onrender.com/api/v1/health) · [GitHub](https://github.com/paritoshtripathi935/MiniHarvery)
> **Companion docs:** [database-design.md](./database-design.md), [schema.sql](./schema.sql)

This is the running source of truth for what's shipped, what's queued, and the
architectural decisions made along the way. Update when you ship.

---

## Product framing

**Vidhi** — Indian legal research workbench for working advocates.
**Sanskrit:** *vidhi* = law / method. Built for the **mid-firm associate** as
the v2 anchor segment, with `users.mode` plumbing for solo and student tiers
behind a future paywall.

Three segments planned, one mode shipped:

| Mode | Status | Surface |
|---|---|---|
| `associate` | live (default) | Full feature set |
| `solo` | scaffolded | Same backend, future paywall + lighter UI |
| `student` | scaffolded | Same backend, future "study mode" |

The chokepoint for per-mode UI is `<FeatureGate>` + `useUserMode()`. When the
day comes, we change one hook implementation; gating lights up everywhere.

---

## ✅ Shipped

### Foundation (PRs #1, #2)
- **Neon Postgres** — async SQLAlchemy 2 + asyncpg + Alembic. 6 migrations live.
- **Persistent threads** — server-backed history; `/threads`, `/threads/:id`.
- **Real Clerk JWT auth** — RS256 verification, JWKS cached 1h, issuer pinned.
- **Guest mode removed** — every request must carry a valid Bearer token.
- **`scripts/push.sh`** — token via `http.extraHeader`, dual-stream scrubbed.

### Sprint 1 — Matters & Case Brief (PR #3)
- **`matters` table** — case files with parties (JSONB), court, cause number.
- **Auto-Inbox** per user, idempotent via partial unique index.
- **Polymorphic `documents`** — case_brief / pleading_draft / authorities_table / note.
- **Case Brief generator** (`services/case_brief_generator.py`) — Cloudflare Llama-3.1-70b at temperature 0.2 with strict-JSON prompt; falls back to empty brief shell on parse failure rather than 500ing.
- **`CallerIdentity` grows `mode` and `inbox_matter_id`** — `resolve_caller` calls `ensure_inbox_matter` so every authenticated request has a valid landing matter.
- **9 new endpoints**: matters CRUD + briefs + documents CRUD.
- **Cross-user safety** verified via repo-level e2e (different user → 404).

### Sprint 2 — UI Redesign (PR #4)
- **Routing** (`react-router-dom@7`):
  - `/` Today (landing dashboard with greeting + recent matters)
  - `/matters` (full matter list)
  - `/matters/:id` (matter detail with Research/Documents/Settings tabs)
  - `/matters/:id/documents/:did` (full-page case brief editor)
  - `/inbox` (resolves to user's Inbox matter)
- **Design system** (`src/design/tokens.ts`):
  - Type scale: `h1 32 / h2 20 / body 15 / ui 13 / micro 11`
  - Source Serif 4 for content + brand · Inter for UI · JetBrains Mono for citations
  - 5-step spacing (xs/sm/md/lg/xl) — no middle values
  - Saffron accent reserved for **decisions** (active route, primary CTA, citation chip, ratio/holding) — never decoration
- **`AppLayout`** — slim NavRail + portal-based breadcrumbs slot
- **`MattersProvider`** context dedupes the matter list across routes
- **Matter detail redesign**:
  - **Tabs** under matter header (Research / Documents / Settings)
  - **Inspector drawer** consolidates the 4 old sibling panels (Threads, Workbook, Sources, Videos) into one right-side drawer with sub-tabs (Sources / Videos / Pinned). Closed by default; auto-opens to Sources after a search lands.
  - **`ThreadPicker`** dropdown (Linear-style: ↑/↓/Enter/Esc, search filter, `+ New thread`) replaces the always-visible threads panel
  - Empty matters now show a focused brief area + composer — no more 4 placeholder paragraphs
- **Documents become pages** (replaces `CaseBriefView` modal):
  - `DocumentDetailPage` with editable title, Draft/Final pill toggle, source link, Delete in More menu
  - `CaseBriefEditor` + `EditableList`: every section inline-editable, `⌘+Enter` commits, hover-to-delete, debounced PATCH with Saving/Saved/Failed indicator
  - `NewBriefDialog`: URL or paste-text mode; two entry points ("Save as brief" on a Sources card prefills URL; "+ New brief" on Documents tab opens blank); navigates to the new doc on success

### Operations
- **Production deploys** working (Render auto-deploys from `main`, Netlify deploys frontend).
- **Gunicorn timeout** bumped to 300s after a `WORKER TIMEOUT` killed an SSE `/answer` stream mid-flight in production. Set in Render dashboard (render.yaml is a bootstrap-only file — runtime changes need the dashboard).
- **Migration discipline** — going forward use **expand-then-contract** for any NOT NULL / FK / drop change: migration adds nullable column → deploy code → follow-up migration tightens. Avoids the "DB migrated but code stale" outage we hit on Sprint 1.

---

## 🔜 What's next

### Sprint 3 — Drafting + Matter Settings *(my recommended next bet)*

**Why these together:**
- Matter Settings is small (~half a day) and unblocks real workflow conversation: "did you set the cause number on the Sharma file?"
- Drafting Workshop is the **highest-leverage feature** on the roadmap — it's what turns Vidhi from a research tool into "the place where the work happens."
- Drafting reuses `EditableList` + the doc-page pattern; Matter Settings reuses `PATCH /matters/:id` which already exists.

**Plan:**

1. **Matter Settings tab** (today a stub).
   - Form with: title, description, parties (add/remove rows), court, cause number, status.
   - PATCH `/api/v1/matters/:id`. Optimistic update + refresh the matter list summary.
   - Files: `pages/MatterDetailPage.tsx` `SettingsView` becomes `MatterSettingsView.tsx`. Maybe a new `PartiesEditor` component.

2. **Drafting Workshop** (the killer).
   - Templates as first-class data: store in `frontend/src/drafts/templates.ts` initially (move to backend if size grows). Each template = `{ id, label, kind, fields: [...], render(values) → string }`.
   - Start with **4 templates**: plaint (CPC O.VII), writ petition (Article 226), anticipatory bail (CrPC s.438), legal notice.
   - Backend: new `services/pleading_draft_generator.py` that takes structured fields + matter context and asks Cloudflare AI to produce a first draft. Returns Markdown + a header block.
   - Frontend: `NewDraftDialog` (template picker → fields form → generate). Lands on `/matters/:id/documents/:did` (same route, different `type='pleading_draft'`). DocumentDetailPage gets a draft renderer (Markdown editor, not the structured EditableList).
   - "Save as draft" footer button on a search result joins "Save as brief".

### Sprint 4 candidates

| Feature | Leverage | Effort | Notes |
|---|---|---|---|
| **Authorities Table** | high | medium | Pin cases across threads → ToA. Needs cross-thread pin tracking in DB. |
| **Limitation Calculator** | medium | small | One-screen utility. No DB needed. |
| **Document export** (Markdown / Word) | medium | small | Copy-to-clipboard for briefs and drafts. |
| **Inbox label tagging** | medium | small | `tags` column on `threads` (jsonb), filter chips. |
| **Today widgets** ("hearings this week", "drafts due") | high | medium | Needs `hearings` table + cron task or calendar integration. |
| **Bare Act Reader** | high | large | Curated statute DB. IPC, CrPC, Constitution first. |
| **Procedure Coach** | medium | medium | Checklist generator. |
| **Hindi/vernacular translation** | high | medium | Paste vernacular, get English brief. Reuses LLM service. |
| **Compare precedents** | medium | medium | Side-by-side judgment view. |
| **Cause List Watcher** | high | large | Daily digest. Needs court-website scrapers. Defer. |

### Cross-cutting backlog

- [ ] **Code-split routes** to halve the 540 KB / 162 KB-gzip bundle. `React.lazy()` per page is a one-afternoon job.
- [ ] **`frontend/.env.example`** with `VITE_CLERK_PUBLISHABLE_KEY` and `VITE_API_URL` placeholders so a fresh checkout doesn't need to derive the publishable key from the issuer.
- [ ] **Pre-existing ESLint errors** in `SearchBar.tsx` / `useTheme.ts` (`react-hooks/set-state-in-effect`) — small follow-up PR.
- [ ] **Indian Kanoon authenticated API** instead of HTML scraping (we already have `INDIAN_KANOON_API_TOKEN` in env). The 403s in production logs degrade the deep-fetch, not the search itself, so it's not P0.
- [ ] **Document type renderers** for `pleading_draft`, `authorities_table`, `note` (today only `case_brief` has UI).
- [ ] **Matter delete from sidebar** (backend supports it via `DELETE /matters/:id`).
- [ ] **Edit existing matter** from `MatterCard` (right-click / hover menu → settings).
- [ ] **Activity tab** in matter detail — chronological log of searches, briefs, edits.

---

## 🧠 Key decisions (so we don't relitigate)

1. **REST, not GraphQL.** Single client, fixed views, SSE on `/answer` is REST-natural. `/matters/:id` returns the full nested tree (matter + threads + documents) — same shape GraphQL would give, no second toolchain. Triggers for migration: a mobile app, partner API, or 30+ endpoints.
2. **Routing > single-page**. `/` Today, `/matters`, `/matters/:id`, `/matters/:id/documents/:did`. Deep links, browser back/forward, URL state. The previous "single page where everything mutates" was the central vibecoded tell.
3. **Inspector drawer over sibling panels.** Three sub-tabs in one closable drawer beat four always-on panels of placeholder copy.
4. **Documents are pages, not modals.** Modals are for confirm/cancel work; case briefs are real documents and need their own URL, breadcrumb, and editable body.
5. **Saffron only for decisions.** Active route stripe, primary CTA, citation chip, ratio/holding heading — that's it. Decorative use is a vibecoded tell.
6. **Source Serif 4 for content / Inter for chrome.** Type does the heavy lifting. Brand and matter titles use serif so the tool feels like a legal-document tool.
7. **5-step type and spacing scales — no middle values.** Removes the temptation to spacing-by-feel.
8. **Polymorphic Documents** — one table, `type` column, JSONB `content`. Adding new doc types is a one-liner, not a new table.
9. **Soft delete** on user-owned rows (`deleted_at`). Hard delete only for caches and rate-limit windows.
10. **`ensure_inbox_matter` on every authenticated request.** Idempotent via partial unique index. Means any caller always has a valid landing matter, no first-time-user race.
11. **Expand-then-contract migrations** — never apply a NOT NULL or column-drop migration to shared DB before code is deployed. Lesson from PR #3 outage.

---

## 📁 Where things live

```
backend/
├── alembic/versions/      # Migrations 0001..0006
├── app/
│   ├── api/v1/            # query_handler, thread_handler, matter_handler, document_handler
│   ├── api/deps.py        # resolve_caller (auth gate, ensure_inbox)
│   ├── core/settings.py   # pydantic-settings, all env vars
│   ├── db/
│   │   ├── models.py      # SQLAlchemy ORM
│   │   ├── repositories.py# All DB SQL lives here
│   │   └── session.py     # async engine, AsyncSessionLocal
│   ├── services/
│   │   ├── case_brief_generator.py
│   │   ├── language_model.py     # /answer streaming
│   │   ├── legal_search_service.py
│   │   ├── content_extractor.py
│   │   └── query_classifier.py
│   └── utils/clerk_auth.py
└── render.yaml            # bootstrap-only; runtime config is in Render dashboard

frontend/
├── src/
│   ├── App.tsx            # Router shell
│   ├── design/tokens.ts   # the only place type/spacing/color is defined
│   ├── layout/            # AppLayout, Breadcrumbs
│   ├── state/MattersContext.tsx
│   ├── pages/             # TodayPage, MattersPage, MatterDetailPage, DocumentDetailPage
│   ├── components/        # MatterCard, ThreadPicker, Inspector, MatterTabs,
│   │                      # CaseBriefEditor, EditableList, NewBriefDialog,
│   │                      # NewMatterButton, FeatureGate, …
│   ├── services/api.ts    # fetch wrappers, types for server payloads
│   └── types.ts           # domain types (Matter, Document, ThreadSummary, …)
└── .env.local             # (gitignored) Clerk publishable key + VITE_API_URL

docs/
├── database-design.md     # the original schema design memo
├── schema.sql             # source-of-truth DDL — kept in lockstep with migrations
└── roadmap.md             # this file
```

---

## 🚦 How to resume tomorrow

1. **Pull main** — every shipped change is there.
2. **Read this doc top-to-bottom.** Skim "What's next" → pick a sprint.
3. **Boot locally** (notes in `.claude/SESSION_NOTES.md` if it exists for you):
   ```sh
   # Backend
   cd backend && .venv/bin/uvicorn main:app --port 8000

   # Frontend
   cd frontend && VITE_API_URL=http://localhost:8000 npm run dev
   # then open http://localhost:5173
   ```
4. **Apply migrations if you've pulled new ones:** `cd backend && .venv/bin/alembic upgrade head`
5. **Start the next sprint with a planning step before code.** Past pattern: I propose the IA / files / scope, you give a thumbs up or push back, then I implement.
