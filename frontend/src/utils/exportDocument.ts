/**
 * Document export — markdown serialisers + a download helper.
 *
 * Briefs ship with a structured CaseBriefContent shape; we serialise it to
 * markdown so the Markdown download and the Print/PDF route consume the
 * same string. Drafts already store markdown directly. Streaming answers
 * are markdown end-to-end and just need the user's question prepended.
 */
import type {
  CaseBriefContent,
  Message,
  PleadingDraftContent,
} from '../types';

/** Build a filesystem-safe slug from a free-text title. */
export function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'document'
  );
}

function bulletList(items: readonly string[]): string {
  return items
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => `- ${s}`)
    .join('\n');
}

function section(heading: string, body: string): string {
  if (!body) return '';
  return `## ${heading}\n\n${body}`;
}

export function briefToMarkdown(
  brief: CaseBriefContent,
  title: string,
): string {
  const parts: string[] = [`# ${title}`];
  if (brief.citation) parts.push(`**Citation:** ${brief.citation}`);

  parts.push(section('Facts', bulletList(brief.facts)));
  parts.push(section('Issues', bulletList(brief.issues)));
  parts.push(
    section('Arguments — Petitioner', bulletList(brief.arguments_petitioner)),
  );
  parts.push(
    section('Arguments — Respondent', bulletList(brief.arguments_respondent)),
  );
  parts.push(section('Ratio', bulletList(brief.ratio)));
  parts.push(section('Holding', bulletList(brief.holding)));
  parts.push(section('Dicta', bulletList(brief.dicta)));

  if (brief.source_url) parts.push(`---\n\n**Source:** ${brief.source_url}`);
  return parts.filter(Boolean).join('\n\n');
}

export function draftToMarkdown(
  content: PleadingDraftContent,
  title: string,
): string {
  const body = (content.markdown ?? '').trim();
  // The model's output usually starts with a cause title rather than a
  // document-name H1. Prepend the doc title so the file stands alone.
  return body ? `# ${title}\n\n${body}` : `# ${title}`;
}

/** Serialise an in-progress thread (one or more turns) as a single
 *  markdown document. The first turn becomes the H1; follow-ups become
 *  H2s, mirroring how Brief.tsx presents them on screen. */
export function transcriptToMarkdown(messages: Message[]): string {
  if (messages.length === 0) return '';
  const [root, ...rest] = messages;
  const blocks: string[] = [`# ${root.query}`];
  const rootBody = root.answer?.content ?? root.streamingText ?? '';
  if (rootBody.trim()) blocks.push(rootBody.trim());
  for (const turn of rest) {
    blocks.push(`## Follow-up: ${turn.query}`);
    const body = turn.answer?.content ?? turn.streamingText ?? '';
    if (body.trim()) blocks.push(body.trim());
  }
  return blocks.join('\n\n');
}

/** Trigger a browser download of `content` as `<filename>.md`. */
export function downloadMarkdown(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.md') ? filename : `${filename}.md`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke after a tick — Safari requires the URL to outlive the click.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
