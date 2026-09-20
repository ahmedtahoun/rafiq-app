import { useState } from 'react';
import { COUNTRIES, type Country } from '../lib/countries';
import { BottomSheet } from './BottomSheet';
import './CountryPicker.css';

interface CountryPickerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  searchPlaceholder: string;
  noResultsLabel: string;
  selectedCode: string;
  onSelect: (country: Country) => void;
  /** Show the dial code beside each row (phone dial-code picker) instead
      of just the country name (location-country picker). */
  showDial?: boolean;
}

/** Searchable country list used by both the "which country are you based
    in" picker and the "phone dial code" picker (Onboarding, ClientOnboarding,
    AddClient, EditProfile, etc. in the design all share this exact pattern
    against the same 195-country list). */
export function CountryPicker({
  open,
  onClose,
  title,
  searchPlaceholder,
  noResultsLabel,
  selectedCode,
  onSelect,
  showDial = false,
}: CountryPickerProps) {
  const [search, setSearch] = useState('');
  const q = search.trim().toLowerCase();
  const results = COUNTRIES.filter((c) => !q || c.name.toLowerCase().includes(q));

  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      <input
        className="country-picker-search"
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={searchPlaceholder}
      />
      <div className="country-picker-list">
        {results.map((c) => {
          const selected = c.code === selectedCode;
          return (
            <button
              key={c.code}
              className={`country-picker-row${selected ? ' is-selected' : ''}`}
              onClick={() => onSelect(c)}
            >
              <span className="country-picker-flag">{c.flag}</span>
              <span className="country-picker-name">{c.name}</span>
              {showDial && <span className="country-picker-dial">{c.dial}</span>}
            </button>
          );
        })}
        {results.length === 0 && <div className="country-picker-empty">{noResultsLabel}</div>}
      </div>
    </BottomSheet>
  );
}
