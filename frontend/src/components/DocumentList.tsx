/**
 * DocumentList — compact list of the active matter's documents.
 * Lives in the sidebar's Workbook area; click a row to open it.
 */
import { FileText, Trash2 } from 'lucide-react';
import type { DocumentRecord } from '../types';

interface Props {
  documents: DocumentRecord[];
  onOpen: (id: string) => void;
  onDelete?: (id: string) => void;
}

const LABELS: Record<DocumentRecord['type'], string> = {
  case_brief: 'Brief',
  pleading_draft: 'Draft',
  authorities_table: 'Authorities',
  note: 'Note',
};

export default function DocumentList({ documents, onOpen, onDelete }: Props) {
  if (documents.length === 0) {
    return (
      <p
        className="text-[11px] italic m-0 px-1 py-2"
        style={{ color: 'var(--text-dim)' }}
      >
        No documents yet. Click "Save as brief" on a search result to add one.
      </p>
    );
  }
  return (
    <ul className="m-0 p-0 list-none space-y-1">
      {documents.map(d => (
        <li key={d.id} className="group flex items-center gap-1.5">
          <button
            onClick={() => onOpen(d.id)}
            className="flex-1 min-w-0 text-left flex items-start gap-2 px-2 py-1.5 rounded cursor-pointer border-0 bg-transparent transition-colors hover:bg-[var(--surface-hover)]"
            style={{ color: 'var(--text)' }}
            title={d.title}
          >
            <FileText size={13} style={{ color: 'var(--text-muted)', marginTop: 2 }} />
            <span className="flex-1 min-w-0">
              <span className="block text-xs font-medium truncate">{d.title}</span>
              <span
                className="block text-[10px]"
                style={{ color: 'var(--text-dim)' }}
              >
                {LABELS[d.type]} · {d.status}
              </span>
            </span>
          </button>
          {onDelete && (
            <button
              onClick={() => onDelete(d.id)}
              className="p-1 rounded opacity-0 group-hover:opacity-100 cursor-pointer border-0 bg-transparent transition-opacity"
              style={{ color: 'var(--text-dim)' }}
              title="Delete document"
            >
              <Trash2 size={11} />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
