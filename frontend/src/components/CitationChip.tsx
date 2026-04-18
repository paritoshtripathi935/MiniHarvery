/**
 * Pill chip for a legal citation — case (gold border) or statute (slate border).
 * Clicking opens the source URL in a new tab.
 */
import { ExternalLink } from 'lucide-react';
import type { Citation } from '../types';

interface Props {
  citation: Citation;
}

export default function CitationChip({ citation }: Props) {
  const isCase = citation.citation_type === 'case';

  const borderColor = isCase ? 'var(--accent)' : 'var(--border)';
  const textColor = isCase ? 'var(--accent-bright)' : 'var(--text-muted)';
  const bgColor = isCase ? 'var(--surface-active)' : 'var(--surface-raised)';

  const inner = (
    <span
      className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border"
      style={{
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

  if (citation.url) {
    return (
      <a href={citation.url} target="_blank" rel="noopener noreferrer">
        {inner}
      </a>
    );
  }
  return inner;
}
