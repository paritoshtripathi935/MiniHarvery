/**
 * Unified source card for a legal search result.
 * Used in both the Sources list and the Workbook (pinned) section.
 * Supports expand, pin, and "open source" actions.
 */
import { useState } from 'react';
import { ExternalLink, Pin, PinOff, ChevronDown } from 'lucide-react';
import type { LegalSearchResult } from '../types';
import JurisdictionBadge from './JurisdictionBadge';

interface Props {
  result: LegalSearchResult;
  pinned: boolean;
  onTogglePin: (url: string) => void;
  /** When true, the card flashes briefly to draw attention */
  flash?: boolean;
}

const SOURCE_LABELS: Record<string, string> = {
  indian_kanoon: 'Indian Kanoon',
  india_code: 'India Code',
  sci: 'Supreme Court',
  google: 'Web',
};

const SOURCE_PROVENANCE: Record<string, { label: string; color: string }> = {
  indian_kanoon: { label: 'verified', color: '#34d399' },
  india_code: { label: 'official', color: '#60a5fa' },
  sci: { label: 'official', color: '#60a5fa' },
  google: { label: 'web · unverified', color: '#f59e0b' },
};

export default function CaseCard({ result, pinned, onTogglePin, flash }: Props) {
  const [expanded, setExpanded] = useState(false);
  const sourceLabel = SOURCE_LABELS[result.source] ?? result.source;
  const provenance = SOURCE_PROVENANCE[result.source];

  return (
    <div
      className={`rounded-lg border transition-all ${
        flash ? 'animate-[flash_1200ms_ease-out]' : ''
      }`}
      style={{
        backgroundColor: pinned ? 'var(--surface-active)' : 'var(--surface-raised)',
        borderColor: pinned ? 'var(--accent-soft)' : 'var(--border)',
        borderLeftWidth: pinned ? '3px' : '1px',
        borderLeftColor: pinned ? 'var(--accent)' : 'var(--border)',
      }}
    >
      {/* Top row: title + pin toggle */}
      <div className="flex items-start justify-between gap-2 p-3">
        <div className="flex-1 min-w-0">
          <p
            className="text-xs font-medium line-clamp-2 leading-snug"
            style={{ color: 'var(--text-bright)' }}
          >
            {result.title}
          </p>

          {/* Meta row */}
          <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
            <span
              className="px-1.5 py-0.5 rounded text-[10px] font-medium"
              style={{ backgroundColor: 'var(--bg)', color: 'var(--text-muted)' }}
            >
              {sourceLabel}
            </span>
            {result.jurisdiction && <JurisdictionBadge jurisdiction={result.jurisdiction} />}
            {result.year && (
              <span className="text-[10px]" style={{ color: 'var(--text-dim)' }}>
                {result.year}
              </span>
            )}
            {provenance && (
              <span
                className="text-[9px] uppercase tracking-wider"
                style={{ color: provenance.color, letterSpacing: '0.1em' }}
              >
                · {provenance.label}
              </span>
            )}
          </div>

          {/* Citation line (if present) */}
          {result.citation && (
            <p
              className="text-[10px] mt-1 font-mono"
              style={{ color: 'var(--accent)' }}
            >
              {result.citation}
            </p>
          )}
        </div>

        <button
          onClick={() => onTogglePin(result.url)}
          className="flex-shrink-0 p-1 rounded cursor-pointer border-0 bg-transparent transition-colors hover:bg-[var(--surface-hover)]"
          style={{ color: pinned ? 'var(--accent)' : 'var(--text-dim)' }}
          aria-label={pinned ? 'Unpin from workbook' : 'Pin to workbook'}
          title={pinned ? 'Unpin from workbook' : 'Pin to workbook'}
        >
          {pinned ? <Pin size={13} fill="var(--accent)" /> : <PinOff size={13} />}
        </button>
      </div>

      {/* Snippet (expandable) */}
      {result.snippet && (
        <div
          className="px-3 pb-2 text-[11px] leading-relaxed"
          style={{ color: 'var(--text-muted)' }}
        >
          <p className={expanded ? '' : 'line-clamp-2'}>{result.snippet}</p>
        </div>
      )}

      {/* Footer actions */}
      <div
        className="flex items-center justify-between px-3 py-2 border-t"
        style={{ borderColor: 'var(--border)' }}
      >
        {result.snippet && result.snippet.length > 120 ? (
          <button
            onClick={() => setExpanded(e => !e)}
            className="flex items-center gap-1 text-[10px] cursor-pointer border-0 bg-transparent"
            style={{ color: 'var(--text-muted)' }}
          >
            <ChevronDown
              size={10}
              style={{
                transform: expanded ? 'rotate(180deg)' : 'rotate(0)',
                transition: 'transform 200ms',
              }}
            />
            {expanded ? 'Less' : 'More'}
          </button>
        ) : (
          <span />
        )}
        <a
          href={result.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-[10px] font-medium no-underline transition-colors"
          style={{ color: 'var(--accent)' }}
        >
          Open source <ExternalLink size={9} />
        </a>
      </div>
    </div>
  );
}
