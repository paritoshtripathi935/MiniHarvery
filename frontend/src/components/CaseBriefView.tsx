/**
 * CaseBriefView — modal that either:
 *  (a) generates a new brief from a search-result URL (button on a SourceCard),
 *      then renders the structured result;
 *  (b) shows an existing brief loaded from the matter's documents.
 *
 * The brief shape is the structured TypedDict from
 * services/case_brief_generator.py: facts, issues, arguments, ratio,
 * holding, dicta. We render each as a bulleted section. Empty sections
 * render an italic "(none)" so the lawyer can see what the LLM omitted.
 */
import { Loader2, X, ExternalLink } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { CaseBriefContent, CaseBriefDocument } from '../types';

interface Props {
  open: boolean;
  onClose: () => void;
  /** When the modal opens with `seed`, kick off generation; we save and
   *  then surface the resulting CaseBriefDocument. */
  seed?: { url?: string; text?: string; title?: string; queryId?: string };
  /** When the modal opens with `existing`, just render it. */
  existing?: CaseBriefDocument;
  /** Called by the modal to actually run the generation. Returns the saved
   *  document so the caller can refresh the matter detail. */
  onGenerate?: (input: {
    url?: string;
    text?: string;
    title?: string;
    query_id?: string;
  }) => Promise<CaseBriefDocument>;
}

export default function CaseBriefView({
  open,
  onClose,
  seed,
  existing,
  onGenerate,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doc, setDoc] = useState<CaseBriefDocument | null>(existing ?? null);

  useEffect(() => {
    if (!open) return;
    if (existing) {
      setDoc(existing);
      return;
    }
    if (!seed || !onGenerate) return;
    let cancelled = false;
    (async () => {
      setBusy(true);
      setError(null);
      try {
        const generated = await onGenerate({
          url: seed.url,
          text: seed.text,
          title: seed.title,
          query_id: seed.queryId,
        });
        if (!cancelled) setDoc(generated);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-16 px-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[80vh] overflow-y-auto rounded-lg border shadow-xl"
        style={{
          backgroundColor: 'var(--surface-raised)',
          borderColor: 'var(--border)',
          color: 'var(--text)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <header
          className="sticky top-0 flex items-center justify-between px-5 py-3 border-b"
          style={{
            backgroundColor: 'var(--surface-raised)',
            borderColor: 'var(--border)',
          }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider"
              style={{ backgroundColor: 'var(--accent)', color: 'var(--bg)' }}
            >
              Case Brief
            </span>
            <span className="text-sm font-medium truncate">
              {doc?.title ?? seed?.title ?? 'Generating brief…'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded cursor-pointer border-0 bg-transparent transition-colors hover:bg-[var(--surface-hover)]"
            style={{ color: 'var(--text-muted)' }}
          >
            <X size={16} />
          </button>
        </header>

        <div className="px-5 py-4 text-sm">
          {busy && (
            <div className="flex items-center gap-2 py-12 justify-center" style={{ color: 'var(--text-muted)' }}>
              <Loader2 size={16} className="animate-spin" />
              <span>Reading judgment and structuring the brief…</span>
            </div>
          )}
          {error && (
            <div className="py-6 text-center" style={{ color: 'var(--text-danger, #ef4444)' }}>
              ⚠️ {error}
            </div>
          )}
          {doc && !busy && !error && <BriefBody content={doc.content} />}
        </div>
      </div>
    </div>
  );
}

function BriefBody({ content }: { content: CaseBriefContent }) {
  return (
    <div className="space-y-4">
      {content.citation && (
        <div
          className="px-3 py-2 rounded text-xs font-mono"
          style={{
            backgroundColor: 'var(--surface)',
            color: 'var(--accent)',
            border: '1px solid var(--border)',
          }}
        >
          {content.citation}
        </div>
      )}
      <BriefSection title="Facts" items={content.facts} />
      <BriefSection title="Issues" items={content.issues} />
      <BriefSection title="Arguments — Petitioner" items={content.arguments_petitioner} />
      <BriefSection title="Arguments — Respondent" items={content.arguments_respondent} />
      <BriefSection title="Ratio decidendi" items={content.ratio} highlight />
      <BriefSection title="Holding" items={content.holding} highlight />
      <BriefSection title="Obiter" items={content.dicta} />
      {content.source_url && (
        <a
          href={content.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[11px] no-underline"
          style={{ color: 'var(--text-dim)' }}
        >
          Source <ExternalLink size={10} />
        </a>
      )}
    </div>
  );
}

function BriefSection({
  title,
  items,
  highlight,
}: {
  title: string;
  items: string[];
  highlight?: boolean;
}) {
  return (
    <section>
      <h3
        className="text-[11px] uppercase tracking-widest font-semibold m-0 mb-1.5"
        style={{
          color: highlight ? 'var(--accent)' : 'var(--text-muted)',
          letterSpacing: '0.18em',
        }}
      >
        {title}
      </h3>
      {items.length === 0 ? (
        <p
          className="text-xs italic m-0"
          style={{ color: 'var(--text-dim)' }}
        >
          (none)
        </p>
      ) : (
        <ul className="m-0 pl-4 space-y-1">
          {items.map((it, i) => (
            <li key={i} className="text-sm leading-relaxed">
              {it}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
