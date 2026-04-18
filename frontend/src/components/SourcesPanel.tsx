/**
 * Right-pane of the Workbench.
 * Split vertically into two individually-minimizable blocks:
 *   - Sources (top):  all results for the active brief, from every provider
 *   - Videos (bottom): YouTube explainers for added context
 *
 * Either block can be collapsed to its header row; the whole panel can
 * also collapse to a thin icon rail.
 */
import { useState } from 'react';
import {
  Library,
  Loader2,
  Film,
  PanelRightClose,
  ChevronDown,
} from 'lucide-react';
import type { LegalSearchResult, VideoResult } from '../types';
import CaseCard from './CaseCard';
import VideoCard from './VideoCard';
import CollapsedRail from './CollapsedRail';

interface Props {
  results: LegalSearchResult[];
  videos: VideoResult[];
  pinnedUrls: Set<string>;
  onTogglePin: (url: string, result: LegalSearchResult) => void;
  /** URL of a source that should flash (e.g. after citation chip click) */
  flashUrl?: string;
  isSearching?: boolean;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

function SectionToggle({
  open,
  onClick,
  label,
}: {
  open: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className="p-1 rounded cursor-pointer border-0 bg-transparent transition-colors hover:bg-[var(--surface-hover)]"
      style={{ color: 'var(--text-dim)' }}
      title={open ? `Collapse ${label}` : `Expand ${label}`}
      aria-label={open ? `Collapse ${label}` : `Expand ${label}`}
      aria-expanded={open}
    >
      <ChevronDown
        size={13}
        style={{
          transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
          transition: 'transform 180ms',
        }}
      />
    </button>
  );
}

export default function SourcesPanel({
  results,
  videos,
  pinnedUrls,
  onTogglePin,
  flashUrl,
  isSearching,
  collapsed,
  onToggleCollapsed,
}: Props) {
  const [sourcesOpen, setSourcesOpen] = useState(true);
  const [videosOpen, setVideosOpen] = useState(true);

  if (collapsed) {
    return (
      <CollapsedRail
        side="right"
        onExpand={onToggleCollapsed}
        sections={[
          { icon: Library, label: 'Sources', count: results.length },
          {
            icon: Film,
            label: 'Videos',
            count: videos.length,
            accent: '#ef4444',
          },
        ]}
      />
    );
  }

  const sourcesFlex = sourcesOpen ? '1 1 0' : '0 0 auto';
  const videosFlex = videosOpen ? '1 1 0' : '0 0 auto';

  return (
    <aside
      className="flex flex-col h-full overflow-hidden border-l"
      style={{
        width: '340px',
        backgroundColor: 'var(--surface)',
        borderColor: 'var(--border)',
      }}
    >
      {/* ─── Sources ─────────────────────────────────────────────── */}
      <div className="flex flex-col min-h-0" style={{ flex: sourcesFlex }}>
        <header
          className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-2">
            <SectionToggle
              open={sourcesOpen}
              onClick={() => setSourcesOpen(v => !v)}
              label="Sources"
            />
            <Library size={12} style={{ color: 'var(--text-muted)' }} />
            <span
              className="text-[11px] font-semibold uppercase tracking-widest"
              style={{ color: 'var(--text-muted)', letterSpacing: '0.15em' }}
            >
              Sources
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px]" style={{ color: 'var(--text-dim)' }}>
              {results.length} found
            </span>
            <button
              onClick={onToggleCollapsed}
              className="p-1 rounded cursor-pointer border-0 bg-transparent transition-colors hover:bg-[var(--surface-hover)]"
              style={{ color: 'var(--text-dim)' }}
              title="Collapse panel"
              aria-label="Collapse right panel"
            >
              <PanelRightClose size={13} />
            </button>
          </div>
        </header>

        {sourcesOpen && (
          <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-2">
            {isSearching && (
              <div
                className="flex items-center gap-2 text-[11px] px-2 py-3"
                style={{ color: 'var(--text-muted)' }}
              >
                <Loader2
                  size={12}
                  className="animate-spin"
                  style={{ color: 'var(--accent)' }}
                />
                Searching Indian legal databases…
              </div>
            )}

            {!isSearching && results.length === 0 && (
              <p
                className="text-[11px] italic px-2 py-6 text-center"
                style={{ color: 'var(--text-dim)' }}
              >
                Sources will appear here once you ask a question.
              </p>
            )}

            {results.map(result => (
              <CaseCard
                key={result.url}
                result={result}
                pinned={pinnedUrls.has(result.url)}
                onTogglePin={url => onTogglePin(url, result)}
                flash={flashUrl === result.url}
              />
            ))}
          </div>
        )}
      </div>

      {/* ─── Videos ──────────────────────────────────────────────── */}
      <div
        className="flex flex-col min-h-0 border-t"
        style={{ flex: videosFlex, borderColor: 'var(--border)' }}
      >
        <header
          className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-2">
            <SectionToggle
              open={videosOpen}
              onClick={() => setVideosOpen(v => !v)}
              label="Videos"
            />
            <Film size={12} style={{ color: '#ef4444' }} />
            <span
              className="text-[11px] font-semibold uppercase tracking-widest"
              style={{ color: 'var(--text-muted)', letterSpacing: '0.15em' }}
            >
              Explainer Videos
            </span>
          </div>
          <span className="text-[10px]" style={{ color: 'var(--text-dim)' }}>
            {videos.length}
          </span>
        </header>

        {videosOpen && (
          <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3">
            {videos.length === 0 ? (
              <p
                className="text-[11px] italic px-2 py-6 text-center"
                style={{ color: 'var(--text-dim)' }}
              >
                Video explainers will appear here.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {videos.map(v => (
                  <VideoCard key={v.video_id} video={v} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
