-- Vidhi — initial schema
-- Target: Neon Postgres 16+
-- Companion doc: docs/database-design.md
--
-- Idempotent: safe to re-run on an empty DB.
-- This is the source of truth for v1; Alembic migrations will be generated from it.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- Extensions
-- ─────────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS citext;     -- case-insensitive email
-- CREATE EXTENSION IF NOT EXISTS vector;  -- enable when we add semantic search


-- ─────────────────────────────────────────────────────────────────────────────
-- Enums
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
    CREATE TYPE query_type_enum AS ENUM ('case_law', 'statute', 'general');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE source_enum AS ENUM ('indian_kanoon', 'india_code', 'sci', 'google');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE doc_type_enum AS ENUM ('judgment', 'act', 'article', 'general');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE answer_status_enum AS ENUM ('streaming', 'complete', 'error');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- users
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    clerk_user_id   text,
    email           citext,
    display_name    text,
    -- Vidhi user segment — defaults to 'associate'; gates feature surface later.
    mode            text        NOT NULL DEFAULT 'associate'
        CHECK (mode IN ('associate', 'solo', 'student')),
    firm_name       text,
    bar_council_id  text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    last_seen_at    timestamptz NOT NULL DEFAULT now(),
    deleted_at      timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS users_clerk_user_id_uq
    ON users (clerk_user_id) WHERE clerk_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS users_last_seen_at_idx
    ON users (last_seen_at);


-- ─────────────────────────────────────────────────────────────────────────────
-- sessions
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
    id                uuid        PRIMARY KEY,                     -- supplied by frontend
    user_id           uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at        timestamptz NOT NULL DEFAULT now(),
    last_accessed_at  timestamptz NOT NULL DEFAULT now(),
    expires_at        timestamptz NOT NULL,
    metadata          jsonb       NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS sessions_user_recent_idx
    ON sessions (user_id, last_accessed_at DESC);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx
    ON sessions (expires_at);


-- ─────────────────────────────────────────────────────────────────────────────
-- matters — the user-facing case file (a Vidhi v2 concept)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS matters (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title         text        NOT NULL,
    description   text,
    parties       jsonb       NOT NULL DEFAULT '[]'::jsonb,
    court         text,
    cause_number  text,
    status        text        NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'closed', 'archived')),
    -- Per-user 'Inbox' matter is auto-created on first login. Partial unique
    -- index below enforces at most one such row per user.
    is_inbox      boolean     NOT NULL DEFAULT false,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    deleted_at    timestamptz
);

CREATE INDEX IF NOT EXISTS matters_user_recent_idx
    ON matters (user_id, updated_at DESC) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS matters_user_inbox_uq
    ON matters (user_id) WHERE is_inbox = true AND deleted_at IS NULL;


-- ─────────────────────────────────────────────────────────────────────────────
-- threads — research scratchpads inside a matter
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS threads (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid        NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
    matter_id   uuid        NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
    title       text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    deleted_at  timestamptz
);

CREATE INDEX IF NOT EXISTS threads_user_recent_idx
    ON threads (user_id, updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS threads_matter_recent_idx
    ON threads (matter_id, updated_at DESC) WHERE deleted_at IS NULL;


-- ─────────────────────────────────────────────────────────────────────────────
-- queries
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS queries (
    id                 uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id         uuid             NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    thread_id          uuid             NOT NULL REFERENCES threads(id)  ON DELETE CASCADE,
    user_id            uuid             NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
    raw_query          text             NOT NULL,
    rewritten_query    text,
    query_type         query_type_enum  NOT NULL,
    result_count       integer          NOT NULL DEFAULT 0,
    search_latency_ms  integer,
    created_at         timestamptz      NOT NULL DEFAULT now(),
    deleted_at         timestamptz
);

CREATE INDEX IF NOT EXISTS queries_user_history_idx
    ON queries (user_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS queries_session_idx
    ON queries (session_id, created_at);
CREATE INDEX IF NOT EXISTS queries_thread_idx
    ON queries (thread_id, created_at);
CREATE INDEX IF NOT EXISTS queries_raw_query_fts_idx
    ON queries USING gin (to_tsvector('english', raw_query));


-- ─────────────────────────────────────────────────────────────────────────────
-- documents — case briefs / drafts / authorities tables / notes
-- Polymorphic via `type`; `content` is a type-specific JSONB blob.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS documents (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    matter_id        uuid        NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
    user_id          uuid        NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
    type             text        NOT NULL
        CHECK (type IN ('case_brief', 'pleading_draft', 'authorities_table', 'note')),
    title            text        NOT NULL,
    content          jsonb       NOT NULL DEFAULT '{}'::jsonb,
    source_url       text,
    source_query_id  uuid        REFERENCES queries(id) ON DELETE SET NULL,
    status           text        NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'final')),
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    deleted_at       timestamptz
);

CREATE INDEX IF NOT EXISTS documents_matter_recent_idx
    ON documents (matter_id, updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS documents_user_type_idx
    ON documents (user_id, type) WHERE deleted_at IS NULL;


-- ─────────────────────────────────────────────────────────────────────────────
-- search_results
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS search_results (
    id              uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
    query_id        uuid           NOT NULL REFERENCES queries(id)   ON DELETE CASCADE,
    rank            smallint       NOT NULL,
    source          source_enum    NOT NULL,
    doc_type        doc_type_enum  NOT NULL,
    title           text           NOT NULL,
    url             text           NOT NULL,
    snippet         text,
    search_content  text,
    jurisdiction    text,
    citation        text,
    year            smallint,
    created_at      timestamptz    NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS search_results_query_rank_idx
    ON search_results (query_id, rank);
CREATE INDEX IF NOT EXISTS search_results_url_idx
    ON search_results (url);
CREATE INDEX IF NOT EXISTS search_results_citation_idx
    ON search_results (citation) WHERE citation IS NOT NULL;


-- ─────────────────────────────────────────────────────────────────────────────
-- videos
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS videos (
    id                uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    query_id          uuid         NOT NULL REFERENCES queries(id) ON DELETE CASCADE,
    rank              smallint     NOT NULL,
    video_id          text         NOT NULL,
    title             text,
    channel           text,
    description       text,
    thumbnail_url     text,
    url               text         NOT NULL,
    published_at      timestamptz,
    duration_seconds  integer,
    created_at        timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS videos_query_rank_idx
    ON videos (query_id, rank);
CREATE INDEX IF NOT EXISTS videos_video_id_idx
    ON videos (video_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- answers
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS answers (
    id                 uuid                 PRIMARY KEY DEFAULT gen_random_uuid(),
    query_id           uuid                 NOT NULL UNIQUE REFERENCES queries(id) ON DELETE CASCADE,
    content            text                 NOT NULL DEFAULT '',
    model              text                 NOT NULL,
    prompt_tokens      integer,
    completion_tokens  integer,
    status             answer_status_enum   NOT NULL DEFAULT 'streaming',
    error_message      text,
    created_at         timestamptz          NOT NULL DEFAULT now(),
    completed_at       timestamptz,
    latency_ms         integer
);

CREATE INDEX IF NOT EXISTS answers_created_at_idx
    ON answers (created_at);


-- ─────────────────────────────────────────────────────────────────────────────
-- citations
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS citations (
    id                uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    answer_id         uuid         NOT NULL REFERENCES answers(id)        ON DELETE CASCADE,
    source_result_id  uuid         REFERENCES search_results(id)          ON DELETE SET NULL,
    citation_text     text         NOT NULL,
    citation_type     text,
    char_start        integer,
    char_end          integer,
    created_at        timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS citations_answer_idx
    ON citations (answer_id);
CREATE INDEX IF NOT EXISTS citations_text_idx
    ON citations (citation_text);


-- ─────────────────────────────────────────────────────────────────────────────
-- suggested_steps
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS suggested_steps (
    id          uuid       PRIMARY KEY DEFAULT gen_random_uuid(),
    answer_id   uuid       NOT NULL REFERENCES answers(id) ON DELETE CASCADE,
    rank        smallint   NOT NULL,
    text        text       NOT NULL,
    UNIQUE (answer_id, rank)
);


-- ─────────────────────────────────────────────────────────────────────────────
-- bookmarks
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bookmarks (
    id          uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid         NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
    query_id    uuid         NOT NULL REFERENCES queries(id) ON DELETE CASCADE,
    note        text,
    created_at  timestamptz  NOT NULL DEFAULT now(),
    UNIQUE (user_id, query_id)
);

CREATE INDEX IF NOT EXISTS bookmarks_user_idx
    ON bookmarks (user_id, created_at DESC);


-- ─────────────────────────────────────────────────────────────────────────────
-- feedback
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS feedback (
    id          uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid         NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
    answer_id   uuid         NOT NULL REFERENCES answers(id) ON DELETE CASCADE,
    rating      smallint     NOT NULL CHECK (rating IN (-1, 0, 1)),
    comment     text,
    created_at  timestamptz  NOT NULL DEFAULT now(),
    UNIQUE (user_id, answer_id)
);

CREATE INDEX IF NOT EXISTS feedback_answer_idx
    ON feedback (answer_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- rate_limits (optional — see docs §4.11)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rate_limits (
    subject       text         NOT NULL,
    endpoint      text         NOT NULL,
    window_start  timestamptz  NOT NULL,
    count         integer      NOT NULL DEFAULT 0,
    PRIMARY KEY (subject, endpoint, window_start)
);

CREATE INDEX IF NOT EXISTS rate_limits_window_idx
    ON rate_limits (window_start);

COMMIT;
