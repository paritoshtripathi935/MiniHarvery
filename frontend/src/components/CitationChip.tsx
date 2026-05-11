/**
 * Pill chip for a legal citation — case (gold border) or statute (slate border).
 * Clicking the chip body opens the source URL in a new tab; an optional
 * trailing pin button surfaces a "Pin to authorities" action that the
 * parent handles (Brief renders this for case citations).
 */
import { useState } from 'react';
import { Bookmark, BookmarkCheck, ExternalLink } from 'lucide-react';
import type { Citation } from '../types';
import { t } from '../design/tokens';

interface Props {
  citation: Citation;
  /** When provided AND the citation is a case, a "Pin" button appears
   *  on hover. Parent decides what pinning means (calls the API,
   *  shows a toast, marks the chip as pinned). */
  onPin?: (citation: Citation) => Promise<void> | void;
  /** Render the chip as already pinned — disables the pin button and
   *  swaps the icon. Parent computes this from its own list. */
  isPinned?: boolean;
}

export default function CitationChip({ citation, onPin, isPinned = false }: Props) {
  const isCase = citation.citation_type === 'case';
  const [hover, setHover] = useState(false);
  const [busy, setBusy] = useState(false);

  const borderColor = isCase ? 'var(--accent)' : 'var(--border)';
  const textColor = isCase ? 'var(--accent-bright)' : 'var(--text-muted)';
  const bgColor = isCase ? 'var(--surface-active)' : 'var(--surface-raised)';

  const showPin = isCase && Boolean(onPin);

  const handlePin = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!onPin || isPinned || busy) return;
    setBusy(true);
    try {
      await onPin(citation);
    } finally {
      setBusy(false);
    }
  };

  const chipInner = (
    <span
      className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border"
      style={{
        gap: '4px',
        borderColor,
        color: textColor,
        backgroundColor: bgColor,
        cursor: citation.url ? 'pointer' : 'default',
      }}
    >
      {isCase ? '⚖️' : '📜'} {citation.text}
      {citation.url && <ExternalLink size={10} />}
    </span>
  );

  const body = citation.url ? (
    <a href={citation.url} target="_blank" rel="noopener noreferrer">
      {chipInner}
    </a>
  ) : (
    chipInner
  );

  return (
    <span
      className="inline-flex items-center"
      style={{ gap: '4px' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {body}
      {showPin && (hover || isPinned) && (
        <button
          onClick={handlePin}
          disabled={isPinned || busy}
          className="inline-flex items-center justify-center cursor-pointer border-0 bg-transparent"
          style={{
            width: '20px',
            height: '20px',
            color: isPinned ? t.color.accent : t.color.muted,
            borderRadius: t.radius.sm,
            cursor: isPinned ? 'default' : busy ? 'wait' : 'pointer',
            transition: t.motion.fast,
          }}
          title={isPinned ? 'Already pinned' : 'Pin to authorities'}
          aria-label={isPinned ? 'Already pinned' : 'Pin to authorities'}
        >
          {isPinned ? <BookmarkCheck size={13} /> : <Bookmark size={13} />}
        </button>
      )}
    </span>
  );
}
