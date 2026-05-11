# Vidhi — Roadmap & Progress

> **Last updated:** 2026-05-11 (after PRs #16–#18 merged + a Cloudflare-shape hotfix)
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
- **Neon Postgres** — async SQLAlchemy 2 + asyncpg + Alembic.
- **Persistent threads** — server-backed history; `/threads`, `/threads/:id`.
- **Real Clerk JWT auth** — RS256 verification, JWKS cached 1h, issuer pinned.
- **Guest mode removed** — every request must carry a valid Bearer token.
- **`scripts/push.sh`** — token via `http.extraHeader`, dual-stream scrubbed.

### Sprint 1 — Matters & Case Brief (PR #3)
- **`matters` table** — case files with parties (JSONB), court, cause number.
- **Auto-Inbox** per user, idempotent via partial unique index.
- **Polymorphic `documents`** — case_brief / pleading_draft / authorities_table / note.
- **Case Brief generator** with strict-JSON prompt; falls back to empty brief shell on parse failure rather than 500ing.
- **`CallerIdentity` grows `mode` and `inbox_matter_id`** — `resolve_caller` calls `ensure_inbox_matter` so every authenticated request has a valid landing matter.
- **9 new endpoints**: matters CRUD + briefs + documents CRUD.
- **Cross-user safety** verified via repo-level e2e (different user → 404).

### Sprint 2 — UI Redesign (PR #4)
- **Routing** (`react-router-dom@7`): `/` Today, `/matters`, `/matters/:id`, `/matters/:id/documents/:did`, `/inbox`.
- **Design system** (`src/design/tokens.ts`): h1 32 / h2 20 / body 15 / ui 13 / micro 11. Source Serif 4 for content + brand · Inter for UI · JetBrains Mono for citations. 5-step spacing. Saffron only for **decisions**.
- **`AppLayout`** — slim NavRail + portal-based breadcrumbs slot.
- **`MattersProvider`** context dedupes the matter list across routes.
- **Matter detail redesign** — Tabs (Research/Documents/Settings), Inspector drawer, ThreadPicker dropdown, `DocumentDetailPage`, `CaseBriefEditor` + `EditableList` with debounced PATCH, `NewBriefDialog`.

### Pre-Sprint-3 refactor pass (PRs #5–#8)
- **#5 — Frontend dead code delete** (~1,260 LOC): `LeftSidebar`, `SourcesPanel`, `MatterSelector`, `CollapsedRail`, `DevBanner`, `DisclaimerFooter`, `SuggestedSteps`, matching CSS, `clearSession`, `react-syntax-highlighter`.
- **#6 — Backend cleanup**: handlers adopt `Depends(get_session)` (deletes 11 hand-rolled try/rollback blocks), drops dead repo helpers + legacy `QueryRequest`, strips MiniPerplexity docstring crumbs, centralises `CLOUDFLARE_LLM_MODEL`, adds startup config sanity warning.
- **#7 — Backend service layer + dir reorg**:
  - New `services/cloudflare_ai.py` — single HTTP scaffold (consolidates language_model + case_brief duplicate scaffolding).
  - New `services/search_pipeline.py` and `services/answer_pipeline.py` — handlers shrink to ~95 lines, business logic in services.
  - `app/utils/` → split into `app/core/auth.py`, `app/core/rate_limiter.py`, `app/services/citation_formatter.py`. `app/models/` → `app/schemas/` (eliminates collision with `db/models.py`).
  - `repo._derive_title` / `_document_to_dict` promoted to public `derive_thread_title` / `document_to_dict`.
- **#8 — Frontend Sprint-3 primitives**:
  - `hooks/useDebouncedSave.ts`, `hooks/useDismissable.ts`.
  - `components/Dialog.tsx`, `components/Field.tsx` (Field/TextInput/TextArea), `components/EditableTitle.tsx`, `components/MoreMenu.tsx`, `components/DocumentRenderer.tsx`.
  - `DocumentRecord` becomes a discriminated union over `type` — `as unknown as CaseBriefDocument` cast gone.
  - `MattersContext.updateMatter(id, fields)` — optimistic projection → PATCH → reconcile → rollback-on-error.

### Sprint 3 — Matter Settings + Drafting Workshop (PRs #9, #10)
- **#9 — Matter Settings tab**: `MatterSettingsForm` (auto-save), `PartiesEditor` (free-text role + name rows). Inbox locks title + status. Server `setActiveMatter` callback keeps tab-switch state fresh.
- **#10 — Drafting Workshop** (the killer feature):
  - 4 templates ship in v1: plaint (CPC O.VII), writ petition (Article 226), anticipatory bail (CrPC s.438), legal notice.
  - `services/pleading_templates.py` — single source of truth: per-template field schema + system + user prompts.
  - `services/pleading_draft_generator.py` — validates fields, renders list-typed fields as Markdown bullets, calls `cloudflare_ai`.
  - `GET /api/v1/draft-templates`, `POST /api/v1/matters/{id}/drafts`.
  - FE: `NewDraftDialog` (two-step picker → fields form), `DraftField`, `MarkdownDraftEditor` (Edit/Preview tab toggle).
  - `DocumentRenderer` dispatches `pleading_draft → MarkdownDraftEditor` — one branch.

### Discoverability (PR #11)
- **Home page templates gallery** — 4 template cards on `/`. Click → `NewDraftDialog` pre-seeded with that template; user picks save-to-matter (defaults to Inbox).
- **Drafts outside a matter** — `NewDraftDialog`'s `matterId` is now optional; when absent, an inline matter-picker appears.
- **Delete matter** — Danger zone in `MatterSettingsForm` (hidden for Inbox). Confirms via `window.confirm`. `MattersContext.removeMatter` optimistically drops the row, refreshes on error.

### LLM infrastructure (PRs #12, #13, #14)
- **#12 — Per-call-site model routing**. Single `CLOUDFLARE_LLM_MODEL` split into four `CLOUDFLARE_LLM_MODEL_{REWRITE,ANSWER,BRIEF,DRAFT}` env-overridable settings. `cloudflare_ai.chat_completion[_stream]` take a required `model:` kwarg. Defaults:
  - `REWRITE = @cf/meta/llama-3.1-8b-instruct-fast`
  - `ANSWER  = @cf/meta/llama-3.3-70b-instruct-fp8-fast`
  - `BRIEF   = @cf/openai/gpt-oss-120b` *(128k context — needed for long judgments; 70B-fast's 24k window was too tight)*
  - `DRAFT   = @cf/meta/llama-3.3-70b-instruct-fp8-fast`
  
  Forced migration: the previous `llama-3.1-70b-instruct` was flagged for deprecation by Cloudflare. Full rationale in `.claude/CLOUDFLARE_MODEL_RESEARCH.md`.

- **#13 — Per-call telemetry**. New `llm_calls` table (migration 0007, pure additive). `cloudflare_ai` gains an `on_complete` callback fired after every call with model, latency, TTFT (streaming), input/output tokens, status. Each call site persists in its existing transaction. SSE answer footer shows `8.2 s · TTFT 1.1 s · 1,847 out · 1,234 in · llama-3.3-70b-instruct-fp8-fast`. `prompt_hash` column reserved + indexed but not yet populated — that's the cache-shortlist hook.

- **#14 — gpt-oss response-shape hotfix**. PR #12 routed BRIEF to gpt-oss-120b but the parser only knew the native Workers AI shape (`result.response`). gpt-oss returns the OpenAI chat-completions shape (`result.choices[0].message.content`). `cloudflare_ai` now tries native first, falls through to OpenAI-compat. Same fix applied to streaming chunks (`delta.content`).

### Bug fixes (PR #15 — PAI-10)
- **Indian Kanoon briefs failed in production.** IK's HTML doc pages 403 most non-browser clients. We had `INDIAN_KANOON_API_TOKEN` configured for search but weren't using it for brief fetches. `content_extractor.fetch_content_from_url` now detects `indiankanoon.org/doc/<tid>/` URLs and routes through the authenticated `api.indiankanoon.org/doc/<tid>/` endpoint (which returns judgment HTML in a `doc` field, fed back through the existing BS4 pipeline). HTML scrape kept as fallback.
- **Briefs from Google-CSE results came out empty.** The generic extractor capped at 5 paragraphs of >50 chars — on most legal sites those are nav, share-bar, "subscribe to read" upsell. The LLM saw a few hundred chars of garbage and returned mostly-empty arrays. Now prefers `<article>` / `[role=main]` / `<main>` containers and collects paragraphs up to `max_chars`. Brief-fetch timeout bumped 5s → 15s; snippet-fetch default unchanged.
- **Defense in depth.** `generate_case_brief` refuses to persist an all-empty brief built from <500 chars of input — handler turns that into a 422 with the existing "paste the judgment text directly" hint, so the user sees a real failure instead of a silently-junk doc.

### PAI-11 — Document export + conversational drafting (PRs #16, #17, #18 + a hotfix)

- **#16 — Export (Markdown + Print/PDF)**. Two export options on every legal-content surface: Markdown download and a chrome-less Print route (OS print dialog → "Save as PDF" — no server-side renderer, no client-side `jspdf`). New `utils/exportDocument.ts` (markdown serialisers for `CaseBriefContent`, `PleadingDraftContent`, and chat transcripts) + a Blob download helper. New `pages/PrintPage.tsx` registered **outside** `AppLayout` for chrome-less rendering, content via `useLocation().state`, auto-fires `window.print()` on the second rAF. Surfaces wired: `DocumentDetailPage` MoreMenu (case_brief, pleading_draft) and `Brief.tsx` answer toolbar (gated on stream finished).

- **#17 — Conversational drafting page**. Template generation defaults to a full-page chat at `/drafting/:templateId` (and `/matters/:matterId/drafting/:templateId`). Backend: new `POST /api/v1/drafting/{template_id}/turn` — stateless field collector; FE re-sends message history + running extracted-fields per turn. Strict-JSON LLM output via `services/drafting_conversation.py` (over `CLOUDFLARE_LLM_MODEL_DRAFT`); server-recomputes `missing_required` from the schema rather than trusting the model; coerces list-typed fields when the model returns a comma-separated string. Frontend: `pages/DraftingChatPage.tsx` (chat column + live extracted-fields panel + Generate button gated on all-required-filled), `components/NewDraftButton.tsx` popover (4 templates → chat + "Use the form instead…" footer) replaces the plain "New draft" buttons in TodayPage and MatterDetailPage. Existing `NewDraftDialog` form stays reachable from the popover and from a chat-page footer link. **Carve-outs**: no streaming of chat turns, no in-progress chat persistence (refresh = lose state; the draft `Document` persists on Generate via the *unchanged* `/matters/:id/drafts` endpoint), no telemetry persistence for drafting-chat turns yet (the `llm_calls.call_site` CHECK constraint pins to `{rewrite,answer,brief,draft}` — widening rides alongside the `prompt_hash` work).

- **Cloudflare hotfix (`8144e6a`, direct-to-main)**. Workers AI sometimes parses strict-JSON model output and returns it as a dict in `result.response` (or `message.content`) rather than a string — first turn of the new drafting chat hit `Unexpected Cloudflare AI response shape`. `_extract_text` now stringifies dict / list responses via `json.dumps` so downstream parsers see the same shape regardless. Module docstring updated to call out three response variants instead of two.

- **#18 — First-pass-draft notice**. The four templates (plaint / writ-226 / anticipatory bail / legal notice) are scaffolds modelled on Indian pleading conventions, **not** adapted from any specific HC's Civil/Original-Side Rules, CPC Appendix A, or CrPC Schedule II. We don't render vakalatnama, affidavit-in-support, court-fee endorsement, or per-court signature blocks. A muted info banner above the Edit/Preview toggle on every `pleading_draft` document tells the advocate to verify against their court's rules before filing. Per-court rule grounding and schedule-of-forms grounding are deferred until there's a clear use signal.

### Operations
- **Production deploys** working (Render auto-deploys from `main`, Netlify deploys frontend).
- **Gunicorn timeout** bumped to 300s after a `WORKER TIMEOUT` killed an SSE `/answer` stream mid-flight in production. Set in Render dashboard (render.yaml is a bootstrap-only file — runtime changes need the dashboard).
- **Migration discipline** — expand-then-contract for any NOT NULL / FK / drop change. Migration 0007 is pure additive (new table only) so it's safe to deploy independently of code.

---

## 🔜 What's next

### Sprint 4 candidates

| Feature | Leverage | Effort | Notes |
|---|---|---|---|
| **Authorities Table** | high | medium | Pin cases across threads → ToA. Needs cross-thread pin tracking in DB. |
| **Limitation Calculator** | medium | small | One-screen utility. No DB needed. |
| **Inbox label tagging** | medium | small | `tags` column on `threads` (jsonb), filter chips. |
| **Today widgets** ("hearings this week", "drafts due") | high | medium | Needs `hearings` table + cron task or calendar integration. |
| **Bare Act Reader** | high | large | Curated statute DB. IPC, CrPC, Constitution first. |
| **Procedure Coach** | medium | medium | Checklist generator. |
| **Hindi/vernacular translation** | high | medium | Paste vernacular, get English brief. Reuses LLM service. |
| **LLM cache** | high | medium | Sits on top of `llm_calls.prompt_hash`. Telemetry from #13 is what feeds the design — query the data first, then design. |
| **Compare precedents** | medium | medium | Side-by-side judgment view. |
| **Cause List Watcher** | high | large | Daily digest. Needs court-website scrapers. Defer. |
| **Per-court template grounding** | medium | medium | Plaint / writ / bail templates today are generic — Delhi HC, Bombay HC, Madras HC each have different Civil/Original-Side Rules. Scope: add a court selector + branch the prompt with court-specific format instructions. |
| **CPC Appendix A / CrPC schedule-of-forms grounding** | medium | large | Highest-fidelity drafting. Render each section in the order the schedule prescribes, cite rule numbers in the output. Should be reviewed by a practising advocate before shipping. |
| **Vakalatnama / affidavit-in-support / court-fee endorsement** | medium | medium | Today's templates produce the prayer + body but skip the wrappers. Needed before drafts are file-ready. |

### Cross-cutting backlog

- [ ] **Code-split routes** to halve the 588 KB / 173 KB-gzip bundle (chat page + print page bumped it). `React.lazy()` per page is a one-afternoon job.
- [ ] **`frontend/.env.example`** with `VITE_CLERK_PUBLISHABLE_KEY` and `VITE_API_URL` placeholders so a fresh checkout doesn't need to derive the publishable key from the issuer.
- [ ] **Pre-existing ESLint errors** in `SearchBar.tsx` / `useTheme.ts` (`react-hooks/set-state-in-effect`) — small follow-up PR.
- [ ] **Document type renderers** for `authorities_table`, `note` (case_brief + pleading_draft now have UI; the other two are still placeholder).
- [ ] **Edit existing matter** from `MatterCard` (right-click / hover menu → settings).
- [ ] **Activity tab** in matter detail — chronological log of searches, briefs, edits.
- [ ] **`prompt_hash` population + `call_site` constraint widening** — required before the LLM cache PR, and now also before drafting-chat turns can be persisted to telemetry. Per call site: rewrite → SHA-256 of raw query; brief → judgment-text fingerprint + URL; draft → canonicalised template + fields; drafting_chat → conversation hash. The constraint widening (add `'drafting_chat'` to the `IN` list) ships with the same migration.
- [ ] **Document detail metrics display** — brief/draft generation `metrics` is in the response payload but only the streaming-answer surface shows it. Add a small monospace strip on `DocumentDetailPage` for newly-generated docs (~30 LOC).
- [ ] **Tailwind decision** — README says no, package.json + index.css say yes. Decide and either rip out or document the split (Tailwind = layout primitives, `t.*` = design values).
- [ ] **Token-ize `Brief.tsx` + `LoginPage.tsx`** — both are pre-token vibecode (hardcoded Georgia, hex colors, raw `'22px'`). Bulk of remaining design-token violations.
- [ ] **`useResearchSession` extraction** — 145-line `handleSearch` orchestration in `MatterDetailPage` belongs in a hook.
- [ ] **Backend `requests` → `httpx.AsyncClient`** — outbound HTTP currently blocks the event loop under `ThreadPoolExecutor`. Real but not P0.

---

## 🧠 Key decisions (so we don't relitigate)

1. **REST, not GraphQL.** Single client, fixed views, SSE on `/answer` is REST-natural. Triggers for migration: a mobile app, partner API, or 30+ endpoints.
2. **Routing > single-page**. Deep links, browser back/forward, URL state.
3. **Inspector drawer over sibling panels.** Three sub-tabs in one closable drawer beat four always-on panels of placeholder copy.
4. **Documents are pages, not modals.** Modals are for confirm/cancel work; case briefs and drafts are real documents and need their own URL, breadcrumb, and editable body.
5. **Saffron only for decisions.** Active route stripe, primary CTA, citation chip, ratio/holding heading — that's it. Decorative use is a vibecoded tell.
6. **Source Serif 4 for content / Inter for chrome.**
7. **5-step type and spacing scales — no middle values.**
8. **Polymorphic Documents** — one table, `type` column, JSONB `content`. `DocumentRecord` is a discriminated union on `type` so each renderer narrows automatically.
9. **Soft delete** on user-owned rows (`deleted_at`). Hard delete only for caches and rate-limit windows.
10. **`ensure_inbox_matter` on every authenticated request.** Idempotent via partial unique index.
11. **Expand-then-contract migrations** — never apply a NOT NULL or column-drop migration to shared DB before code is deployed. Lesson from PR #3 outage.
12. **HTTP plumbing in handlers, business logic in services, SQL in repos.** Pre-Sprint-3 refactor (PR #7) moved /search and /answer workflows from inline-in-handler to `services/{search,answer}_pipeline.py`. Repos own SQL; handlers own request validation + response framing.
13. **Per-call-site LLM model routing.** Each LLM path picks a model that fits its job (PR #12). Telemetry (PR #13) feeds the future cache and the future "is this model still right" question.
14. **`cloudflare_ai` is shape-agnostic.** Tries native Workers AI shape, falls through to OpenAI-compat. New models that follow either convention just work (PR #14 lesson).
15. **Telemetry never crashes a real request.** `cloudflare_ai._emit` swallows + logs callback exceptions. Persisting metrics is a best-effort, anchored to the same transaction as the artefact it produced — no orphan rows.

---

## 📁 Where things live

```
backend/
├── alembic/versions/       # Migrations 0001..0007
├── app/
│   ├── api/v1/             # query_handler, thread_handler, matter_handler,
│   │                       # document_handler, drafting_handler
│   │                       # (handlers are thin)
│   ├── api/deps.py         # resolve_caller (auth gate, ensure_inbox)
│   ├── core/
│   │   ├── auth.py         # Clerk JWT verification (was utils/clerk_auth.py)
│   │   ├── rate_limiter.py # token-bucket (was utils/rate_limiter.py)
│   │   └── settings.py     # pydantic-settings, all env vars + 4 LLM model slugs
│   ├── db/
│   │   ├── models.py       # SQLAlchemy ORM (incl. LlmCall)
│   │   ├── repositories.py # All DB SQL lives here
│   │   └── session.py      # async engine, AsyncSessionLocal, get_session
│   ├── schemas/            # Pydantic request DTOs (was app/models/)
│   │   ├── query_model.py
│   │   ├── search_model.py
│   │   └── draft_model.py
│   └── services/
│       ├── cloudflare_ai.py            # HTTP scaffold + on_complete telemetry
│       ├── search_pipeline.py          # /search workflow
│       ├── answer_pipeline.py          # /answer SSE pipeline
│       ├── case_brief_generator.py
│       ├── pleading_draft_generator.py
│       ├── pleading_templates.py       # 4 templates: schema + prompts
│       ├── drafting_conversation.py    # field-collector for the chat page
│       ├── language_model.py           # rewrite + answer prompts
│       ├── legal_search_service.py
│       ├── content_extractor.py
│       ├── citation_formatter.py       # was utils/citation_formatter.py
│       └── query_classifier.py
└── render.yaml             # bootstrap-only; runtime config is in Render dashboard

frontend/
├── src/
│   ├── App.tsx             # Router shell
│   ├── design/tokens.ts    # the only place type/spacing/color is defined
│   ├── layout/             # AppLayout, Breadcrumbs
│   ├── state/MattersContext.tsx   # +updateMatter, +removeMatter
│   ├── pages/              # TodayPage (templates gallery + quick actions),
│   │                       # MattersPage, MatterDetailPage,
│   │                       # DocumentDetailPage,
│   │                       # DraftingChatPage (full-page chat drafting),
│   │                       # PrintPage (chrome-less /print route)
│   ├── components/         # Dialog, Field, EditableTitle, MoreMenu,
│   │                       # DocumentRenderer, MarkdownDraftEditor,
│   │                       # MatterSettingsForm, PartiesEditor,
│   │                       # NewDraftDialog, DraftField, NewBriefDialog,
│   │                       # NewDraftButton (chat-first popover),
│   │                       # CaseBriefEditor, EditableList, MatterCard,
│   │                       # ThreadPicker, Inspector, MatterTabs,
│   │                       # NewMatterButton, FeatureGate, …
│   ├── hooks/              # useDebouncedSave, useDismissable, useTheme,
│   │                       # useUserMode
│   ├── services/
│   │   ├── api.ts          # fetch wrappers (incl. draftingTurn)
│   │   └── draftTemplates.ts # lazy module-level cache for /draft-templates
│   ├── utils/
│   │   └── exportDocument.ts  # markdown serialisers + Blob download helper
│   └── types.ts            # discriminated DocumentRecord, LlmCallMetrics, …
└── .env.local              # (gitignored) Clerk publishable key + VITE_API_URL

docs/
├── database-design.md      # the original schema design memo
├── schema.sql              # source-of-truth DDL — kept in lockstep with migrations
└── roadmap.md              # this file

.claude/                    # gitignored
├── SESSION_NOTES.md        # quick-resume cheatsheet
├── REVIEW_BACKEND.md       # pre-Sprint-3 review (PR #5–#7 came out of it)
├── REVIEW_FRONTEND.md      # pre-Sprint-3 review (PR #5, #8 came out of it)
├── DRAFTING_WORKSHOP_DESIGN.md  # signed-off design memo for PR #10
└── CLOUDFLARE_MODEL_RESEARCH.md # routing rationale for PR #12
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
