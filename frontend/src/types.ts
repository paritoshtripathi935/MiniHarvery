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
