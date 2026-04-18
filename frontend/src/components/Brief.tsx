/**
 * Brief — the center pane, rendered as a legal memorandum.
 * Typography-first: serif body, small-caps section headings, hairline rules,
 * a single gold accent for citations and the Conclusion callout.
 *
 * Sections mapped from Harvey's output:
 *   Issue            → "Issue"             (the formal legal framing; the H1 above is the client's raw matter)
 *   Applicable Law   → "Governing Law"
 *   Relevant Cases   → "Authorities"
 *   Analysis         → "Discussion"
 *   Conclusion       → "Conclusion"  (pulled out with a gold rule — the only boxed element)
 *   Suggested Steps  → "Recommended Actions"
 *   Follow-up Questions → "Keep Researching" (rendered as clickable chips)
 *
 * Principles:
 *   · No nested cards. Hierarchy comes from type, not boxes.
 *   · One accent color (gold). Every section the same restraint.
 *   · Collapse removed — a memo is meant to be read in one scroll.
 *   · Streaming falls back to a single serif block.
 */
import { useState, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { Copy, Check, Loader2, Scale, ArrowUpRight } from 'lucide-react';
import type { Message, Citation, LegalSearchResult } from '../types';
import CitationChip from './CitationChip';

interface Props {
  /**
   * All messages in the active thread, in chronological order. The first
   * message is the root matter; any subsequent entries are follow-up turns
   * that stack below as one continuous conversation.
   */
  messages: Message[];
  pinnedUrls: Set<string>;
  onCitationClick: (citation: Citation, results: LegalSearchResult[]) => void;
  /** Fire a follow-up question inside the same thread. */
  onFollowUp?: (query: string) => void;
}

type SectionKey =
  | 'issue'
  | 'applicable_law'
  | 'relevant_cases'
  | 'analysis'
  | 'conclusion'
  | 'next_steps'
  | 'follow_ups';

interface SectionDef {
  key: SectionKey;
  /** Short legal-memo label shown in the brief */
  label: string;
  aliases: string[];
}

const SECTIONS: SectionDef[] = [
  { key: 'issue', label: 'Issue', aliases: ['issue', 'issues', 'question presented'] },
  {
    key: 'applicable_law',
    label: 'Governing Law',
    aliases: ['applicable law', 'governing law', 'law', 'relevant law', 'statutory framework'],
  },
  {
    key: 'relevant_cases',
    label: 'Authorities',
    aliases: ['relevant cases', 'authorities', 'case law', 'precedent', 'precedents', 'cases'],
  },
  { key: 'analysis', label: 'Discussion', aliases: ['analysis', 'discussion'] },
  { key: 'conclusion', label: 'Conclusion', aliases: ['conclusion', 'holding', 'brief answer'] },
  {
    key: 'next_steps',
    label: 'Recommended Actions',
    aliases: [
      'suggested next steps',
      'next steps',
      'recommendations',
      'recommended actions',
      'suggested steps',
    ],
  },
  {
    key: 'follow_ups',
    label: 'Keep Researching',
    aliases: [
      'follow-up questions',
      'follow up questions',
      'followup questions',
      'follow-ups',
      'follow ups',
      'related questions',
      'suggested questions',
    ],
  },
];

function buildHeaderPattern(): RegExp {
  const labels = SECTIONS.flatMap(s => s.aliases).sort((a, b) => b.length - a.length);
  const escaped = labels.map(l => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const joined = escaped.join('|');
  return new RegExp(
    `(^|\\n)\\s*(?:#{1,4}\\s+|\\*\\*\\s*)(${joined})(?:\\s*:\\s*|\\s*)\\*{0,2}\\s*:?`,
    'gi',
  );
}

function resolveSection(raw: string): SectionDef | null {
  const lower = raw.trim().toLowerCase();
  for (const s of SECTIONS) {
    if (s.aliases.some(a => a === lower || lower.startsWith(a))) return s;
  }
  return null;
}

interface ParsedSection {
  def: SectionDef;
  body: string;
}

function parseBrief(content: string): ParsedSection[] {
  if (!content.trim()) return [];
  const pattern = buildHeaderPattern();
  const matches = [...content.matchAll(pattern)];
  if (matches.length === 0) {
    return [{ def: SECTIONS.find(s => s.key === 'analysis')!, body: content.trim() }];
  }
  const out: ParsedSection[] = [];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const next = matches[i + 1];
    const def = resolveSection(m[2]);
    if (!def) continue;
    const start = m.index! + m[0].length;
    const end = next ? next.index! : content.length;
    const body = content.slice(start, end).trim();
    const existing = out.find(s => s.def.key === def.key);
    if (existing) existing.body += '\n\n' + body;
    else out.push({ def, body });
  }
  return out;
}

const QUERY_TYPE_LABELS: Record<string, string> = {
  case_law: 'Case Law',
  statute: 'Statute',
  general: 'General Legal',
};

/** Strip Markdown list markers so we can render the raw lines ourselves. */
function splitAuthorityLines(markdown: string): string[] {
  const byLine = markdown
    .split('\n')
    .map(l => l.replace(/^\s*(?:\d+[.)]|[-*•])\s+/, '').trim())
    .filter(Boolean);

  // If the model returned the cases as one comma-separated paragraph instead
  // of a bulleted list, split on the natural case-to-case boundaries. Two
  // patterns cover the shapes we actually see in the wild:
  //   (a) "), " or ")), " — the close of a citation paren followed by a
  //       comma and the next capitalized case name (optionally preceded by
  //       "and ", as in "... (2019), and Divya Nair vs ...").
  //   (b) "YYYY, " — a bare 4-digit year (no citation paren) followed by a
  //       comma and the next capitalized name.
  const CASE_BOUNDARY =
    /(?<=\))\s*,\s+(?:and\s+)?(?=[A-Z])|(?<=\d{4})\s*,\s+(?=[A-Z])/g;
  const expanded: string[] = [];
  for (const line of byLine) {
    if (line.length > 120 && CASE_BOUNDARY.test(line)) {
      CASE_BOUNDARY.lastIndex = 0; // reset after .test()
      expanded.push(
        ...line
          .split(CASE_BOUNDARY)
          .map(s => s.trim())
          .filter(Boolean),
      );
    } else {
      expanded.push(line);
    }
  }
  return expanded;
}

function SectionHeading({ label, aside }: { label: string; aside?: React.ReactNode }) {
  return (
    <h2 className="memo-heading">
      <span>{label}</span>
      {aside && <span className="text-[10px]" style={{ color: 'var(--text-dim)' }}>{aside}</span>}
    </h2>
  );
}

export default function Brief({
  messages,
  pinnedUrls: _pinnedUrls,
  onCitationClick,
  onFollowUp,
}: Props) {
  const [copied, setCopied] = useState(false);

  // Empty state — no active thread yet
  if (messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-8 text-center">
        <Scale size={56} style={{ color: 'var(--border)' }} />
        <h2
          className="text-xl font-semibold mt-4 mb-1"
          style={{ color: 'var(--accent-bright)', fontFamily: 'Georgia, serif' }}
        >
          A new matter
        </h2>
        <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
          Ask a legal question to begin your research brief.
        </p>
      </div>
    );
  }

  const rootMessage = messages[0];
  // The masthead's query-type chip reflects the root matter's classification
  const queryTypeLabel =
    rootMessage.answer?.query_type && QUERY_TYPE_LABELS[rootMessage.answer.query_type];

  // Copy the full conversation — every turn's answer text concatenated
  const fullTranscript = messages
    .map(m => m.answer?.content ?? m.streamingText ?? '')
    .filter(Boolean)
    .join('\n\n---\n\n');

  const handleCopy = async () => {
    if (!fullTranscript) return;
    await navigator.clipboard.writeText(fullTranscript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <article className="flex flex-col h-full overflow-hidden">
      {/* Document masthead — eyebrow + serif title, no chat-avatar chrome */}
      <header
        className="flex-shrink-0 px-10 pt-8 pb-4"
        style={{ backgroundColor: 'var(--bg)' }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div
              className="flex items-center gap-3 text-[10px] uppercase mb-2"
              style={{ color: 'var(--text-dim)', letterSpacing: '0.22em' }}
            >
              <span>Memorandum</span>
              {queryTypeLabel && (
                <>
                  <span style={{ color: 'var(--border)' }}>·</span>
                  <span style={{ color: 'var(--accent)' }}>{queryTypeLabel}</span>
                </>
              )}
            </div>
            <h1
              className="m-0 font-semibold leading-tight flex items-baseline gap-3 flex-wrap"
              style={{
                color: 'var(--text)',
                fontFamily: 'Georgia, "Times New Roman", serif',
                fontSize: '22px',
                letterSpacing: '-0.005em',
              }}
            >
              <span
                className="text-[10px] font-semibold uppercase flex-shrink-0"
                style={{
                  color: 'var(--text-dim)',
                  letterSpacing: '0.22em',
                  fontFamily:
                    '-apple-system, BlinkMacSystemFont, sans-serif',
                  fontStyle: 'normal',
                }}
              >
                In&nbsp;re
              </span>
              <span>{rootMessage.query}</span>
            </h1>
          </div>
          {fullTranscript && (
            <button
              onClick={handleCopy}
              className="flex-shrink-0 flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded border cursor-pointer transition-colors"
              style={{
                backgroundColor: 'transparent',
                borderColor: 'var(--border)',
                color: 'var(--text-muted)',
                letterSpacing: '0.1em',
              }}
              title="Copy brief to clipboard"
            >
              {copied ? <Check size={10} /> : <Copy size={10} />}
              {copied ? 'COPIED' : 'COPY BRIEF'}
            </button>
          )}
        </div>
      </header>

      {/* Scrollable document body — iterates over every turn in the thread. */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-10 pb-10">
          {messages.map((turn, idx) => (
            <BriefTurn
              key={turn.id}
              turn={turn}
              isFollowUp={idx > 0}
              onCitationClick={onCitationClick}
              onFollowUp={onFollowUp}
            />
          ))}
        </div>
      </div>
    </article>
  );
}

/**
 * One turn of the conversation. The first turn sits directly under the
 * masthead; subsequent turns are prefaced with a divider and a compact
 * "FOLLOW-UP" eyebrow so the reader sees the threading without losing the
 * memo's typographic discipline.
 */
function BriefTurn({
  turn,
  isFollowUp,
  onCitationClick,
  onFollowUp,
}: {
  turn: Message;
  isFollowUp: boolean;
  onCitationClick: (citation: Citation, results: LegalSearchResult[]) => void;
  onFollowUp?: (query: string) => void;
}) {
  const displayText = turn.answer ? turn.answer.content : (turn.streamingText ?? '');
  const isStreaming = turn.isAnswering && !turn.answer;
  const sections = useMemo(() => parseBrief(displayText), [displayText]);
  const sectionByKey = useMemo(() => {
    const map: Partial<Record<SectionKey, ParsedSection>> = {};
    for (const s of sections) map[s.def.key] = s;
    return map;
  }, [sections]);

  return (
    <>
      {/* Follow-up eyebrow — compact header before every turn past the first */}
      {isFollowUp && (
        <div
          className="mt-10 pt-6 border-t"
          style={{ borderColor: 'var(--border)' }}
        >
          <div
            className="text-[10px] font-semibold uppercase mb-2"
            style={{ color: 'var(--accent)', letterSpacing: '0.22em' }}
          >
            Follow-up
          </div>
          <h2
            className="m-0 mb-4"
            style={{
              color: 'var(--text)',
              fontFamily: 'Georgia, "Times New Roman", serif',
              fontSize: '17px',
              fontWeight: 600,
              lineHeight: 1.35,
            }}
          >
            {turn.query}
          </h2>
        </div>
      )}

      {/* Searching state */}
      {turn.isSearching && (
        <div
          className="flex items-center gap-2 text-sm py-6"
          style={{ color: 'var(--text-muted)' }}
        >
          <Loader2 size={14} className="animate-spin" style={{ color: 'var(--accent)' }} />
          Searching Indian legal databases…
        </div>
      )}

      {/* Streaming — single serif block, no section parsing */}
      {isStreaming && (
        <div>
          <div
            className="flex items-center gap-2 text-[11px] uppercase mb-3"
            style={{ color: 'var(--accent)', letterSpacing: '0.2em' }}
          >
            <Loader2 size={11} className="animate-spin" />
            Drafting brief
          </div>
          <div className="memo-prose">
            <ReactMarkdown>{displayText}</ReactMarkdown>
          </div>
        </div>
      )}

      {/* Rendered brief */}
      {!isStreaming && sections.length > 0 && (
        <>
          {sectionByKey.issue && (
            <section>
              <SectionHeading label="Issue" />
              <div
                className="memo-prose"
                style={{ fontStyle: 'italic', color: 'var(--text-conclusion)' }}
              >
                <ReactMarkdown>{sectionByKey.issue.body}</ReactMarkdown>
              </div>
            </section>
          )}

          {sectionByKey.applicable_law && (
            <section>
              <SectionHeading label="Governing Law" />
              <div className="memo-prose">
                <ReactMarkdown>{sectionByKey.applicable_law.body}</ReactMarkdown>
              </div>
            </section>
          )}

          {sectionByKey.relevant_cases && (
            <section>
              <SectionHeading
                label="Authorities"
                aside={`${splitAuthorityLines(sectionByKey.relevant_cases.body).length} cited`}
              />
              <ul className="memo-authorities m-0 p-0">
                {splitAuthorityLines(sectionByKey.relevant_cases.body).map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </section>
          )}

          {sectionByKey.analysis && (
            <section>
              <SectionHeading label="Discussion" />
              <div className="memo-prose">
                <ReactMarkdown>{sectionByKey.analysis.body}</ReactMarkdown>
              </div>
            </section>
          )}

          {sectionByKey.conclusion && (
            <section>
              <SectionHeading label="Conclusion" />
              <div className="memo-conclusion">
                <ReactMarkdown>{sectionByKey.conclusion.body}</ReactMarkdown>
              </div>
            </section>
          )}

          {sectionByKey.next_steps && (
            <section>
              <SectionHeading label="Recommended Actions" />
              <ol
                className="m-0 space-y-2 pl-0"
                style={{ listStyle: 'none', counterReset: 'step' }}
              >
                {splitAuthorityLines(sectionByKey.next_steps.body).map((line, i) => (
                  <li
                    key={i}
                    className="flex gap-3 items-baseline"
                    style={{
                      fontFamily: 'Georgia, serif',
                      fontSize: '14px',
                      color: 'var(--text-bright)',
                      lineHeight: 1.65,
                    }}
                  >
                    <span
                      className="flex-shrink-0 text-[10px] font-semibold"
                      style={{
                        color: 'var(--accent)',
                        letterSpacing: '0.1em',
                        minWidth: '1.5em',
                      }}
                    >
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span>{line}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {sectionByKey.follow_ups && onFollowUp && (
            <section>
              <SectionHeading label="Keep Researching" />
              <div className="flex flex-col gap-2">
                {splitAuthorityLines(sectionByKey.follow_ups.body)
                  .map(q => q.replace(/^["'\s]+|["'\s?.]+$/g, '').trim())
                  .filter(q => q.length > 3)
                  .map((question, i) => (
                    <button
                      key={i}
                      onClick={() => onFollowUp(question)}
                      className="group flex items-center justify-between gap-3 text-left px-3 py-2.5 rounded-md cursor-pointer border transition-colors hover:bg-[var(--surface-hover)]"
                      style={{
                        backgroundColor: 'var(--surface-raised)',
                        borderColor: 'var(--border)',
                        color: 'var(--text-bright)',
                        fontFamily: 'Georgia, serif',
                        fontSize: '13.5px',
                        lineHeight: 1.5,
                      }}
                      title="Ask this as your next question"
                    >
                      <span>{question}?</span>
                      <ArrowUpRight
                        size={14}
                        className="flex-shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                        style={{ color: 'var(--accent)' }}
                      />
                    </button>
                  ))}
              </div>
            </section>
          )}
        </>
      )}

      {/* Citations rail — per turn */}
      {!isStreaming && turn.answer && turn.answer.citations.length > 0 && (
        <section className="mt-10 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
          <h2 className="memo-heading" style={{ border: 'none', marginTop: 0 }}>
            Citations in this brief
          </h2>
          <div className="flex flex-wrap gap-2">
            {turn.answer.citations.map((citation, i) => (
              <span
                key={i}
                onClick={() => onCitationClick(citation, turn.search_results)}
                className="cursor-pointer"
                title="Find in Sources panel"
              >
                <CitationChip citation={citation} />
              </span>
            ))}
          </div>
        </section>
      )}

      {/* No-results fallback */}
      {!turn.isSearching &&
        !turn.isAnswering &&
        !turn.answer &&
        turn.search_results.length === 0 && (
          <p className="text-sm py-8 text-center" style={{ color: 'var(--text-dim)' }}>
            No results found. Try rephrasing your question.
          </p>
        )}
    </>
  );
}
