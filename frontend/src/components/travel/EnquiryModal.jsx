import { useEffect, useId, useRef } from 'react';

import EnquiryForm from './EnquiryForm';
import { track } from '../../services/analytics';

/**
 * `EnquiryForm` in a dialog, for "Enquire" buttons that should not take the
 * visitor away from what they were reading.
 *
 * Dialog behaviour follows MobileNavigation.jsx: the page behind cannot scroll,
 * Escape closes, focus moves in on open and returns to whatever was focused
 * before on close. Tab is additionally cycled inside the panel, because
 * `aria-modal="true"` promises the rest of the page is unreachable.
 *
 * On a phone it is a bottom sheet sized in `dvh` — iOS toolbars shrink `vh`
 * mid-scroll, which would clip the submit button — and the form scrolls inside
 * the panel rather than the panel growing past the viewport.
 */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function EnquiryModal({ isOpen, onClose, packageSlug, packageTitle }) {
  const panelRef = useRef(null);
  const titleId = useId();

  // Its own effect, apart from the focus trap below: that one also depends on
  // `onClose`, and an unstable callback re-running it must not re-count an
  // open. This fires exactly once per open. `track` is not setState.
  useEffect(() => {
    if (isOpen) {
      track('enquiry_form_opened', {
        ...(packageSlug ? { entityType: 'package', entitySlug: packageSlug } : {}),
      });
    }
  }, [isOpen, packageSlug]);

  useEffect(() => {
    if (!isOpen) return;

    // Captured now: by cleanup time the ref may point elsewhere, and the
    // element that opened the dialog is the one focus belongs to afterwards.
    const panel = panelRef.current;
    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panel) return;

      const focusable = panel.querySelectorAll(FOCUSABLE);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
        event.preventDefault();
        last.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    // The panel itself, not the first input: screen readers then announce the
    // dialog and its name before reading the form.
    const focusTimer = setTimeout(() => panel?.focus(), 30);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      clearTimeout(focusTimer);
      previouslyFocused?.focus?.();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        type="button"
        aria-label="Close enquiry form"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-zinc-950/50 animate-backdrop-in"
      />

      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 pb-safe animate-slide-in-up focus-visible:outline-none sm:max-h-[calc(100dvh-3rem)] sm:max-w-lg sm:rounded-2xl sm:animate-fade-slide-up"
      >
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-zinc-100 dark:border-zinc-800 px-5 py-4">
          <h2 id={titleId} className="text-base font-bold tracking-tight text-zinc-950 dark:text-zinc-50">
            Send an enquiry
          </h2>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close enquiry form"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-zinc-600 dark:text-zinc-300 transition-colors duration-150 hover:bg-zinc-100 dark:hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/20 dark:focus-visible:ring-zinc-100/20"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-5">
          <EnquiryForm
        /* The form replaces itself with a success panel, taking the focused
           submit button with it — send focus back to the labelled dialog. */
        onSuccess={() => panelRef.current?.focus()} packageSlug={packageSlug} packageTitle={packageTitle} compact />
        </div>
      </div>
    </div>
  );
}
