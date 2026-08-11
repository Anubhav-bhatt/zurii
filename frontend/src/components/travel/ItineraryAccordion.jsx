import { useId, useState } from 'react';

/**
 * The day-by-day itinerary, as a set of disclosures with day 1 already open.
 *
 * This was a stack of native `<details>` elements. It is now a controlled
 * button + region accordion, because `<details>` toggles its content with
 * `display: none` and therefore cannot be transitioned — the panel snapped
 * open, which on a phone jumped the rest of the page under the reader's thumb.
 * Everything `<details>` gave for free is reproduced explicitly: the trigger is
 * a real `<button>` inside a heading (the ARIA accordion pattern, so screen
 * readers can jump day to day), it carries `aria-expanded` and `aria-controls`,
 * and the panel is a named `role="region"`.
 *
 * The animation is the `grid-template-rows: 0fr → 1fr` trick: the panel is a
 * one-row grid and the row is what animates, so the real content height is
 * never measured in JavaScript and there is no layout shift. It needs the inner
 * `overflow-hidden` wrapper — that both clips the text and lets the grid item
 * shrink below its content — and it needs all padding to live inside that
 * wrapper, or the padding would still show as a sliver when closed.
 * index.css drops transition durations to zero under prefers-reduced-motion.
 *
 * Several days can be open at once: the itineraries run to 8 days and closing
 * yesterday to read today makes comparing them impossible.
 */

export default function ItineraryAccordion({ itinerary, className = '' }) {
  const baseId = useId();
  const [openDays, setOpenDays] = useState(() => new Set([0]));

  if (!itinerary?.length) return null;

  const toggle = (index) =>
    setOpenDays((previous) => {
      const next = new Set(previous);
      if (!next.delete(index)) next.add(index);
      return next;
    });

  return (
    <div
      className={`divide-y divide-zinc-200/80 overflow-hidden rounded-2xl border border-zinc-200/80 dark:divide-zinc-800 dark:border-zinc-800 ${className}`}
    >
      {itinerary.map((day, index) => {
        const open = openDays.has(index);
        const triggerId = `${baseId}-day-${index}`;
        const panelId = `${baseId}-panel-${index}`;

        return (
          <div key={day.day ?? index} className="bg-white dark:bg-zinc-900">
            <h3>
              <button
                type="button"
                id={triggerId}
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => toggle(index)}
                className="flex w-full cursor-pointer items-center gap-4 p-4 text-left transition-colors duration-150 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-900/20 dark:focus-visible:ring-zinc-100/20"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-violet-100 bg-violet-50 text-xs font-bold text-violet-700 dark:border-violet-900/50 dark:bg-violet-950/40 dark:text-violet-400">
                  D{day.day ?? index + 1}
                </span>
                <span className="flex-1 text-sm font-semibold text-zinc-900 dark:text-zinc-50 sm:text-[15px]">{day.title}</span>
                <svg
                  aria-hidden="true"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  className={`h-4 w-4 shrink-0 text-zinc-400 dark:text-zinc-500 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
                >
                  <path d="M5.5 7.5L10 12l4.5-4.5" strokeLinecap="round" />
                </svg>
              </button>
            </h3>

            <div
              id={panelId}
              role="region"
              aria-labelledby={triggerId}
              className={`grid transition-[grid-template-rows] duration-200 ease-out ${
                open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
              }`}
            >
              {/* Clipping wrapper: holds the padding and keeps the closed panel
                  out of the tab order and the accessibility tree. */}
              <div className="overflow-hidden" inert={!open}>
                <p className="px-4 pb-5 pl-[4.5rem] text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
                  {day.description}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
