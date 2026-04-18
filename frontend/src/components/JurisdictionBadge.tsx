/**
 * Coloured pill badge indicating court/jurisdiction level.
 */
interface Props {
  jurisdiction: string;
}

// Tinted backgrounds use the accent color with low alpha so they read
// on both dark (navy) and light (cream) surfaces. Text colors are chosen
// to carry sufficient contrast in both themes.
const STYLE_MAP: Record<string, { bg: string; text: string; label: string }> = {
  'Supreme Court of India': { bg: 'rgba(212,160,23,0.18)', text: 'var(--accent)', label: 'SC' },
  'High Court': { bg: 'rgba(96,165,250,0.18)', text: '#2563eb', label: 'HC' },
  'Tribunal': { bg: 'rgba(167,139,250,0.18)', text: '#7c3aed', label: 'Tribunal' },
  'Central Government': { bg: 'rgba(52,211,153,0.18)', text: '#059669', label: 'Central' },
};

function resolveStyle(jurisdiction: string) {
  for (const [key, style] of Object.entries(STYLE_MAP)) {
    if (jurisdiction.toLowerCase().includes(key.toLowerCase())) return style;
  }
  if (jurisdiction.toLowerCase().includes('high court') || jurisdiction.toLowerCase().includes(' hc'))
    return STYLE_MAP['High Court'];
  return { bg: 'var(--surface-hover)', text: 'var(--text-muted)', label: jurisdiction.slice(0, 8) };
}

export default function JurisdictionBadge({ jurisdiction }: Props) {
  const style = resolveStyle(jurisdiction);
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium"
      style={{ backgroundColor: style.bg, color: style.text }}
    >
      {style.label}
    </span>
  );
}
