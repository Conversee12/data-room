'use client';

import { Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';

interface SearchBoxProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

/**
 * Typing updates the local field immediately and the query a beat later, so the
 * input never feels laggy and a full word does not cost one request per letter.
 */
export function SearchBox({ value, onChange, placeholder = 'Search this data room' }: SearchBoxProps) {
  const [draft, setDraft] = useState(value);

  useEffect(() => setDraft(value), [value]);

  useEffect(() => {
    if (draft === value) return;
    const timer = window.setTimeout(() => onChange(draft), 250);
    return () => window.clearTimeout(timer);
  }, [draft, value, onChange]);

  return (
    <div className="relative max-w-md">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint"
        aria-hidden
      />
      <Input
        type="search"
        value={draft}
        placeholder={placeholder}
        aria-label={placeholder}
        className="pl-9 pr-9"
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setDraft('');
            onChange('');
          }
        }}
      />
      {draft ? (
        <Button
          variant="ghost"
          size="icon"
          aria-label="Clear search"
          className="absolute right-1 top-1/2 -translate-y-1/2"
          onClick={() => {
            setDraft('');
            onChange('');
          }}
        >
          <X />
        </Button>
      ) : null}
    </div>
  );
}
