import type { ReactNode, MouseEvent } from 'react';
import './BottomSheet.css';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

/** The backdrop + rounded-top sliding panel used throughout the design
    for filter sheets, confirmation dialogs, and pickers (Discover's
    filter sheet, Subscription's cancel survey, ClientCoach's subscribe
    flow, etc.) — one implementation instead of every screen rebuilding
    its own overlay. */
export function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  if (!open) return null;

  function stop(e: MouseEvent) {
    e.stopPropagation();
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet-panel" onClick={stop}>
        <div className="sheet-grabber" />
        {title && (
          <div className="sheet-header">
            <div className="sheet-title">{title}</div>
            <button className="sheet-close" aria-label="Close" onClick={onClose}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
