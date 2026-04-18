/**
 * Numbered list of actionable legal steps extracted from Harvey's response.
 * Rendered as a distinct card with a green header.
 */
import { ListChecks } from 'lucide-react';

interface Props {
  steps: string[];
}

export default function SuggestedSteps({ steps }: Props) {
  if (!steps || steps.length === 0) return null;

  return (
    <div
      className="mt-4 rounded-xl p-4 border"
      style={{
        backgroundColor: 'rgba(52,211,153,0.10)',
        borderColor: 'rgba(52,211,153,0.45)',
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        <ListChecks size={16} style={{ color: '#059669' }} />
        <span className="text-sm font-semibold" style={{ color: '#059669' }}>
          Suggested Next Steps
        </span>
      </div>
      <ol className="space-y-2">
        {steps.map((step, i) => (
          <li key={i} className="flex gap-3 text-sm" style={{ color: 'var(--text-bright)' }}>
            <span
              className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
              style={{ backgroundColor: 'rgba(52,211,153,0.20)', color: '#059669' }}
            >
              {i + 1}
            </span>
            <span style={{ lineHeight: '1.5' }}>{step}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
