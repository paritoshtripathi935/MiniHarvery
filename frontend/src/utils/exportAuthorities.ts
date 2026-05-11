/**
 * Table-of-Authorities serialiser — turns the matter's pinned cases
 * into a Markdown ToA that can be downloaded or fed through the
 * existing `/print` route. Mirrors the format used by Indian and
 * British-Commonwealth practice: numbered cases with citation,
 * proposition, paragraphs cited, and source link.
 */
import type { Authority } from '../types';

function caseHeading(a: Authority): string {
  const parts: string[] = [`**${a.case_name.trim()}**`];
  if (a.citation) parts.push(a.citation.trim());
  const meta: string[] = [];
  if (a.court) meta.push(a.court.trim());
  if (a.year) meta.push(String(a.year));
  if (meta.length) parts.push(`(${meta.join(', ')})`);
  return parts.join(', ');
}

function authorityBlock(a: Authority, index: number): string {
  const lines: string[] = [`${index + 1}. ${caseHeading(a)}`];
  const proposition = a.proposition?.trim();
  if (proposition) lines.push(`   - *Proposition:* ${proposition}`);
  const paragraphs = (a.paragraphs ?? []).filter(p => p && p.trim());
  if (paragraphs.length) {
    lines.push(`   - *Paragraphs cited:* ${paragraphs.map(p => p.trim()).join(', ')}`);
  }
  const notes = a.notes?.trim();
  if (notes) lines.push(`   - *Notes:* ${notes}`);
  if (a.source_url) lines.push(`   - [Source](${a.source_url})`);
  return lines.join('\n');
}

export function authoritiesToMarkdown(
  authorities: Authority[],
  matterTitle: string,
): string {
  const heading = `# Table of Authorities`;
  const subtitle = matterTitle ? `*${matterTitle}*` : '';
  if (authorities.length === 0) {
    return [heading, subtitle, '_No authorities pinned yet._']
      .filter(Boolean)
      .join('\n\n');
  }
  const cases = ['## Cases', authorities.map(authorityBlock).join('\n\n')].join('\n\n');
  return [heading, subtitle, cases].filter(Boolean).join('\n\n');
}
