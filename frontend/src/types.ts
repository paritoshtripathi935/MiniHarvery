// ── Core domain types ─────────────────────────────────────────────────────

export type QueryType = 'case_law' | 'statute' | 'general';

export type JurisdictionLevel =
  | 'Supreme Court of India'
  | 'High Court'
  | 'District Court'
  | 'Tribunal'
  | 'Central Government'
  | string;

export type LegalSource = 'indian_kanoon' | 'india_code' | 'sci' | 'google';
export type DocType = 'judgment' | 'act' | 'article' | 'general';

export interface VideoResult {
  video_id: string;
  title: string;
  channel: string;
  description: string;
  thumbnail_url: string;
  url: string;
  published_at?: string;
  duration?: string;
}

export interface LegalSearchResult {
  question: string;
  title: string;
  url: string;
  snippet: string;
  search_content: string;
  source: LegalSource;
  doc_type: DocType;
  jurisdiction?: JurisdictionLevel;
  citation?: string;
  year?: number;
}

export interface Citation {
  text: string;
  citation_type: 'case' | 'statute';
  url?: string;
}

export interface LegalAnswer {
  content: string;
  citations: Citation[];
  suggested_steps: string[];
  query_type: QueryType;
}

// ── User mode (Vidhi segment) ─────────────────────────────────────────────

export type UserMode = 'associate' | 'solo' | 'student';

// ── Matter (case file) ────────────────────────────────────────────────────

export interface Party {
  role: string;   // 'petitioner' | 'respondent' | 'plaintiff' | 'defendant' | ...
  name: string;
}

export interface MatterSummary {
  id: string;
  title: string;
  description: string | null;
  court: string | null;
  cause_number: string | null;
  status: 'active' | 'closed' | 'archived';
  is_inbox: boolean;
  parties: Party[];
  created_at: string;
  updated_at: string;
  thread_count: number;
  document_count: number;
}

export interface MatterDetail extends MatterSummary {
  threads: ThreadSummary[];
  documents: DocumentRecord[];
}

// ── Documents (polymorphic — case briefs, drafts, notes) ─────────────────

export type DocumentType =
  | 'case_brief'
  | 'pleading_draft'
  | 'authorities_table'
  | 'note';

interface DocumentBase {
  id: string;
  matter_id: string;
  title: string;
  source_url: string | null;
  source_query_id: string | null;
  status: 'draft' | 'final';
  created_at: string;
  updated_at: string;
}

/** Strict shape returned by the case-brief generator. Mirrors the Python
 * `CaseBrief` TypedDict — keep in sync. */
export interface CaseBriefContent {
  citation: string | null;
  facts: string[];
  issues: string[];
  arguments_petitioner: string[];
  arguments_respondent: string[];
  ratio: string[];
  holding: string[];
  dicta: string[];
  source_url: string | null;
}

export interface CaseBriefDocument extends DocumentBase {
  type: 'case_brief';
  content: CaseBriefContent;
}

export interface PleadingDraftDocument extends DocumentBase {
  type: 'pleading_draft';
  content: Record<string, unknown>;
}

export interface AuthoritiesTableDocument extends DocumentBase {
  type: 'authorities_table';
  content: Record<string, unknown>;
}

export interface NoteDocument extends DocumentBase {
  type: 'note';
  content: Record<string, unknown>;
}

/** Discriminated union over `type` — narrowing on `doc.type === 'case_brief'`
 * gives `CaseBriefContent` without casts. Sprint 3 tightens
 * `PleadingDraftDocument['content']` when the draft template fields land. */
export type DocumentRecord =
  | CaseBriefDocument
  | PleadingDraftDocument
  | AuthoritiesTableDocument
  | NoteDocument;

// ── Thread (server history) ───────────────────────────────────────────────

export interface ThreadSummary {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
  query_count: number;
}

// ── Message (conversation unit) ───────────────────────────────────────────

export interface Message {
  id: string;
  /**
   * All messages (turns) in the same conversation share a threadId.
   * The first message of a thread mints a new threadId; follow-up
   * questions reuse their parent's threadId so they render as one
   * conversation in the sidebar and stack inside the Brief.
   */
  threadId: string;
  query: string;
  search_results: LegalSearchResult[];
  videos: VideoResult[];
  answer?: LegalAnswer;
  isSearching?: boolean;
  isAnswering?: boolean;
  streamingText?: string;
  timestamp: Date;
}
