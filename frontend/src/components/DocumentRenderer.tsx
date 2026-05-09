import type { CaseBriefContent, DocumentRecord } from '../types';
import CaseBriefEditor from './CaseBriefEditor';
import { t } from '../design/tokens';

interface Props {
  doc: DocumentRecord;
  /** Persist a content change. The content shape narrows by `doc.type`. */
  onContentChange: (next: Record<string, unknown>) => Promise<void>;
}

/**
 * Pick the right editor for a polymorphic document. Adding a new type
 * (Sprint 3 adds `pleading_draft`) means writing the editor and adding
 * one branch here — no other site changes.
 */
export default function DocumentRenderer({ doc, onContentChange }: Props) {
  switch (doc.type) {
    case 'case_brief':
      return (
        <CaseBriefEditor
          content={doc.content}
          onSave={(next: CaseBriefContent) =>
            onContentChange(next as unknown as Record<string, unknown>)
          }
        />
      );
    case 'pleading_draft':
    case 'authorities_table':
    case 'note':
      return <UnsupportedType type={doc.type} />;
  }
}

function UnsupportedType({ type }: { type: string }) {
  return (
    <p
      style={{
        padding: t.space.lg,
        fontSize: t.size.body,
        color: t.color.muted,
        textAlign: 'center',
      }}
    >
      Editing for documents of type <code className="mono">{type}</code> isn't
      shipped yet — the API can read/write them, the UI is on the way.
    </p>
  );
}
