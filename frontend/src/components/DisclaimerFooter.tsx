/**
 * Bottom bar — legal disclaimer on the left, developer credit on the right.
 * Always visible; spans the full viewport width.
 */
import { ExternalLink } from 'lucide-react';

export default function DisclaimerFooter() {
  return (
    <div
      className="flex items-center justify-between gap-4 py-2 px-4 text-[11px]"
      style={{
        color: 'var(--text-dim)',
        borderTop: '1px solid var(--border)',
      }}
    >
      {/* Left — legal disclaimer */}
      <p className="m-0 flex-1 min-w-0 truncate sm:whitespace-normal">
        ⚖️ MiniHarvey provides legal information only — not legal advice. For
        your specific situation, consult a qualified advocate registered with
        the{' '}
        <span style={{ color: 'var(--accent)' }}>Bar Council of India</span>.
      </p>

      {/* Right — developer credit */}
      <a
        href="https://paritoshdev.netlify.app/"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1.5 flex-shrink-0 no-underline transition-colors"
        style={{ color: 'var(--text-muted)' }}
        title="Built by Paritosh Tripathi"
      >
        <span className="hidden sm:inline">Built by</span>
        <span
          style={{
            color: 'var(--accent)',
            fontFamily: 'Georgia, serif',
            fontWeight: 600,
          }}
        >
          Paritosh Tripathi
        </span>
        <ExternalLink size={10} style={{ color: 'var(--text-dim)' }} />
      </a>
    </div>
  );
}
