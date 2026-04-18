/**
 * Search bar with cycling legal query placeholders and typing animation.
 * Mirrors MiniPerplexity's SearchBar.tsx animation pattern.
 */
import { useState, useEffect, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { Search, Loader2 } from 'lucide-react';

const LEGAL_PLACEHOLDERS = [
  'What are my rights if arrested without a warrant?',
  'Section 138 Negotiable Instruments Act — cheque bounce',
  'Landmark judgments on Article 21 right to life',
  'Divorce procedure under Hindu Marriage Act',
  'Bail conditions under CrPC Section 437',
  'Can employer terminate without notice in India?',
  'Consumer complaint process under COPRA',
  'What is anticipatory bail under Section 438 CrPC?',
  'Rights of accused under Indian Constitution',
  'How to file RTI application?',
];

interface Props {
  onSearch: (query: string) => void;
  isLoading: boolean;
}

export default function SearchBar({ onSearch, isLoading }: Props) {
  const [query, setQuery] = useState('');
  const [placeholder, setPlaceholder] = useState('');
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Typing animation for placeholder (same pattern as MiniPerplexity)
  useEffect(() => {
    const target = LEGAL_PLACEHOLDERS[placeholderIdx];
    let timeout: ReturnType<typeof setTimeout>;

    if (!isDeleting && charIdx <= target.length) {
      timeout = setTimeout(() => {
        setPlaceholder(target.slice(0, charIdx));
        setCharIdx(c => c + 1);
      }, 60);
    } else if (!isDeleting && charIdx > target.length) {
      timeout = setTimeout(() => setIsDeleting(true), 2000);
    } else if (isDeleting && charIdx > 0) {
      timeout = setTimeout(() => {
        setPlaceholder(target.slice(0, charIdx - 1));
        setCharIdx(c => c - 1);
      }, 30);
    } else if (isDeleting && charIdx === 0) {
      setIsDeleting(false);
      setPlaceholderIdx(i => (i + 1) % LEGAL_PLACEHOLDERS.length);
    }

    return () => clearTimeout(timeout);
  }, [charIdx, isDeleting, placeholderIdx]);

  const handleSubmit = () => {
    if (!query.trim() || isLoading) return;
    onSearch(query.trim());
    setQuery('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSubmit();
  };

  return (
    <div
      className="flex items-center gap-2 rounded-xl px-4 py-3 border"
      style={{
        backgroundColor: 'var(--surface-raised)',
        borderColor: 'var(--border)',
      }}
    >
      <Search size={18} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder || 'Ask a legal question...'}
        disabled={isLoading}
        className="flex-1 bg-transparent outline-none text-sm"
        style={{ color: 'var(--text)', caretColor: 'var(--accent)' }}
      />
      <button
        onClick={handleSubmit}
        disabled={!query.trim() || isLoading}
        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
        style={{
          backgroundColor: 'var(--accent)',
          color: 'var(--bg)',
        }}
      >
        {isLoading ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <Search size={14} />
        )}
        {isLoading ? 'Searching...' : 'Ask'}
      </button>
    </div>
  );
}
