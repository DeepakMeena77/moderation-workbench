import CloseRounded from '@mui/icons-material/CloseRounded';
import SearchRounded from '@mui/icons-material/SearchRounded';
import Box from '@mui/material/Box';
import InputBase from '@mui/material/InputBase';
import { useEffect, useRef, useState } from 'react';
import { m3 } from '../theme/theme';
import { IconButton } from './IconButton';

export interface SearchBarProps {
  /** The committed value (from the URL). */
  value: string;
  onSearch: (value: string) => void;
  label: string;
  placeholder?: string;
  debounceMs?: number;
}

export const SEARCH_DEBOUNCE_MS = 300; // 03 sec. 4

// Search bar (03 sec. 4): height 56, full radius, field fill, leading search icon, trailing clear button.
// Typing is debounced; the committed value lives in the URL, so a reload or a shared link keeps the search.
export function SearchBar({ value, onSearch, label, placeholder, debounceMs = SEARCH_DEBOUNCE_MS }: SearchBarProps) {
  const [draft, setDraft] = useState(value);
  const committed = useRef(value);

  // A new value from outside (back button, "Clear filters") replaces the draft.
  useEffect(() => {
    committed.current = value;
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (draft.trim() === committed.current) return;
    const timer = setTimeout(() => {
      committed.current = draft.trim();
      onSearch(draft.trim());
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [draft, debounceMs, onSearch]);

  return (
    <Box
      role="search"
      data-ui="search"
      sx={(t) => ({
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        height: 56,
        pl: 4,
        pr: 1,
        borderRadius: 9999,
        backgroundColor: m3(t).field,
        color: m3(t).onSurfaceVariant,
        '&:focus-within': { outline: `3px solid ${m3(t).secondary}`, outlineOffset: 2 },
      })}
    >
      <SearchRounded aria-hidden />
      <InputBase
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            committed.current = draft.trim();
            onSearch(draft.trim());
          }
        }}
        placeholder={placeholder}
        inputProps={{ 'aria-label': label, type: 'search', maxLength: 200 }}
        sx={(t) => ({
          flex: 1,
          minWidth: 0,
          ...t.typography.body1,
          color: m3(t).onSurface,
          '& input::placeholder': { color: m3(t).onSurfaceVariant, opacity: 1 },
          '& input:focus-visible': { outline: 'none' },
          '& input::-webkit-search-cancel-button': { display: 'none' },
        })}
      />
      {draft ? (
        <IconButton
          label="Clear search"
          onClick={() => {
            setDraft('');
            committed.current = '';
            onSearch('');
          }}
        >
          <CloseRounded />
        </IconButton>
      ) : null}
    </Box>
  );
}
