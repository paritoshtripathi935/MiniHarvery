/**
 * Inspector — single right-side drawer that consolidates everything that
 * used to be a sibling panel (Sources, Explainer Videos, pinned Workbook
 * cards). The drawer is closed by default; pinned-icon toggles in the
 * header open it to a specific tab.
 *
 * Why a single drawer rather than three open panels at once:
 *   - Empty matters used to render four placeholder panels — vibecoded.
 *   - Notion, Linear, Apple Mail all use this pattern: focused center,
 *     contextual inspector that opens on intent.
 *   - When closed, the brief + composer get the full content width.
 */
import type { ReactNode } from 'react';
import {
  ChevronRight,
  Library,
  Film,
  Pin,
} from 'lucide-react';
import type { LegalSearchResult, VideoResult } from '../types';
import CaseCard from './CaseCard';
import VideoCard from './VideoCard';
import { t } from '../design/tokens';

export type InspectorTab = 'sources' | 'videos' | 'pinned';

interface Props {
  open: boolean;
  activeTab: InspectorTab;
  onClose: () => void;
  onTabChange: (tab: InspectorTab) => void;

  results: LegalSearchResult[];
  videos: VideoResult[];
  pinnedResults: LegalSearchResult[];
  pinnedUrls: Set<string>;
  onTogglePin: (url: string, result: LegalSearchResult) => void;
  flashUrl?: string;
  isSearching?: boolean;
  onSaveAsBrief?: (result: LegalSearchResult) => void;
}

export default function Inspector({
  open,
  activeTab,
  onClose,
  onTabChange,
  results,
  videos,
  pinnedResults,
  pinnedUrls,
  onTogglePin,
  flashUrl,
  isSearching,
  onSaveAsBrief,
}: Props) {
  if (!open) return null;
  return (
    <aside
      className="flex flex-col flex-shrink-0"
      style={{
        width: '380px',
        borderLeft: `1px solid ${t.color.border}`,
        backgroundColor: t.color.surface,
      }}
    >
      <header
        className="flex items-center"
        style={{
          gap: t.space.xs,
          padding: `${t.space.sm} ${t.space.md}`,
          borderBottom: `1px solid ${t.color.border}`,
          flexShrink: 0,
        }}
      >
        <Tab
          icon={Library}
          label="Sources"
          count={results.length}
          active={activeTab === 'sources'}
          onClick={() => onTabChange('sources')}
        />
        <Tab
          icon={Film}
          label="Videos"
          count={videos.length}
          active={activeTab === 'videos'}
          onClick={() => onTabChange('videos')}
        />
        <Tab
          icon={Pin}
          label="Pinned"
          count={pinnedResults.length}
          active={activeTab === 'pinned'}
          onClick={() => onTabChange('pinned')}
        />
        <button
          onClick={onClose}
          className="p-1 rounded cursor-pointer border-0 bg-transparent transition-colors hover:bg-[var(--surface-hover)]"
          style={{ color: t.color.muted, marginLeft: 'auto' }}
          title="Close inspector"
        >
          <ChevronRight size={14} />
        </button>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto" style={{ padding: t.space.md }}>
        {activeTab === 'sources' &&
          (results.length === 0 ? (
            <Empty
              title={isSearching ? 'Searching…' : 'Sources will appear here'}
              copy="Once you ask a question, the legal sources we pull from Indian Kanoon, India Code, and the web show up here."
            />
          ) : (
            <CardList>
              {results.map(r => (
                <CaseCard
                  key={r.url}
                  result={r}
                  pinned={pinnedUrls.has(r.url)}
                  onTogglePin={url => onTogglePin(url, r)}
                  flash={flashUrl === r.url}
                  onSaveAsBrief={onSaveAsBrief ? () => onSaveAsBrief(r) : undefined}
                />
              ))}
            </CardList>
          ))}

        {activeTab === 'videos' &&
          (videos.length === 0 ? (
            <Empty
              title="No videos yet"
              copy="When a search returns YouTube explainers, they appear here."
            />
          ) : (
            <CardList>
              {videos.map(v => (
                <VideoCard key={v.video_id} video={v} />
              ))}
            </CardList>
          ))}

        {activeTab === 'pinned' &&
          (pinnedResults.length === 0 ? (
            <Empty
              title="Nothing pinned yet"
              copy="Pin a source to keep it visible while you switch threads. Useful when building a Table of Authorities."
            />
          ) : (
            <CardList>
              {pinnedResults.map(r => (
                <CaseCard
                  key={r.url}
                  result={r}
                  pinned={true}
                  onTogglePin={url => onTogglePin(url, r)}
                  flash={flashUrl === r.url}
                  onSaveAsBrief={onSaveAsBrief ? () => onSaveAsBrief(r) : undefined}
                />
              ))}
            </CardList>
          ))}
      </div>
    </aside>
  );
}

function Tab({
  icon: Icon,
  label,
  count,
  active,
  onClick,
}: {
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center cursor-pointer border-0 bg-transparent"
      style={{
        gap: t.space.xs,
        padding: `${t.space.xs} ${t.space.sm}`,
        fontSize: t.size.ui,
        fontWeight: t.weight.medium,
        color: active ? t.color.text : t.color.muted,
        borderRadius: t.radius.sm,
        backgroundColor: active ? t.color.hover : 'transparent',
        transition: t.motion.fast,
      }}
    >
      <Icon size={13} style={{ color: active ? t.color.accent : t.color.dim }} />
      {label}
      {count > 0 && (
        <span
          style={{
            fontSize: t.size.micro,
            color: active ? t.color.accent : t.color.dim,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function Empty({ title, copy }: { title: string; copy: string }) {
  return (
    <div
      style={{
        padding: `${t.space.lg} ${t.space.md}`,
        textAlign: 'center',
      }}
    >
      <p
        className="m-0"
        style={{
          fontSize: t.size.ui,
          fontWeight: t.weight.medium,
          color: t.color.muted,
          marginBottom: t.space.sm,
        }}
      >
        {title}
      </p>
      <p
        className="m-0"
        style={{
          fontSize: t.size.micro,
          color: t.color.dim,
          maxWidth: '36ch',
          margin: '0 auto',
          lineHeight: 1.5,
        }}
      >
        {copy}
      </p>
    </div>
  );
}

function CardList({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col" style={{ gap: t.space.sm }}>
      {children}
    </div>
  );
}

/** Compact button group used in the matter header to open the inspector
 *  to a specific tab. Shows a count badge so the user knows there's
 *  content without opening the drawer. */
export function InspectorToggleGroup({
  active,
  open,
  onSelect,
  counts,
}: {
  active: InspectorTab | null;
  open: boolean;
  onSelect: (tab: InspectorTab) => void;
  counts: Record<InspectorTab, number>;
}) {
  return (
    <div
      className="flex items-center"
      style={{
        gap: '2px',
        padding: '2px',
        backgroundColor: t.color.surface,
        border: `1px solid ${t.color.border}`,
        borderRadius: t.radius.md,
      }}
    >
      <ToggleButton
        icon={Library}
        label="Sources"
        count={counts.sources}
        active={open && active === 'sources'}
        onClick={() => onSelect('sources')}
      />
      <ToggleButton
        icon={Film}
        label="Videos"
        count={counts.videos}
        active={open && active === 'videos'}
        onClick={() => onSelect('videos')}
      />
      <ToggleButton
        icon={Pin}
        label="Pinned"
        count={counts.pinned}
        active={open && active === 'pinned'}
        onClick={() => onSelect('pinned')}
      />
    </div>
  );
}

function ToggleButton({
  icon: Icon,
  label,
  count,
  active,
  onClick,
}: {
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={`${label}${count ? ` (${count})` : ''}`}
      className="inline-flex items-center cursor-pointer border-0"
      style={{
        gap: t.space.xs,
        padding: `${t.space.xs} ${t.space.sm}`,
        fontSize: t.size.ui,
        fontWeight: t.weight.medium,
        color: active ? t.color.text : t.color.muted,
        backgroundColor: active ? t.color.hover : 'transparent',
        borderRadius: t.radius.sm,
        transition: t.motion.fast,
      }}
    >
      <Icon size={13} style={{ color: active ? t.color.accent : t.color.dim }} />
      <span className="hidden lg:inline">{label}</span>
      {count > 0 && (
        <span
          style={{
            fontSize: t.size.micro,
            color: active ? t.color.accent : t.color.dim,
            fontVariantNumeric: 'tabular-nums',
            marginLeft: t.space.xs,
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

export { Inspector };
