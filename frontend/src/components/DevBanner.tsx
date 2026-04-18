/**
 * Thin ticker bar shown above the app header.
 * Announces that the project is under active development,
 * like a live news crawl. Pure CSS marquee — no JS timers.
 */
import { AlertTriangle } from 'lucide-react';

const MESSAGES = [
  'This project is under active development',
  'Expect rough edges, occasional errors, and breaking changes',
  'Information shown is for research only — not legal advice',
  'Consult a qualified advocate registered with the Bar Council of India',
  'Feedback welcome — this is an open experiment in Indian legal AI',
];

export default function DevBanner() {
  // Repeat the track twice so the translate loop is seamless.
  const track = (
    <div className="dev-banner-track">
      {MESSAGES.map((m, i) => (
        <span key={i} className="dev-banner-item">
          <AlertTriangle size={10} className="dev-banner-dot" />
          {m}
        </span>
      ))}
    </div>
  );

  return (
    <div
      className="dev-banner"
      role="status"
      aria-label="Development notice"
    >
      <span className="dev-banner-badge">
        <span className="dev-banner-pulse" />
        LIVE · DEV
      </span>
      <div className="dev-banner-viewport">
        {track}
        {track}
      </div>
    </div>
  );
}
