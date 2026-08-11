import { Link } from 'react-router-dom';

/**
 * Section heading + optional supporting line + optional trailing link.
 * Used by every homepage and listing section so heading scale, spacing and
 * the "View all →" affordance are identical everywhere.
 */
export default function SectionHeader({ eyebrow, title, description, action, className = '', align = 'left', id }) {
  const centered = align === 'center';

  return (
    <div
      className={`${centered ? 'text-center max-w-2xl mx-auto' : 'sm:flex sm:items-end sm:justify-between sm:gap-8'} mb-8 sm:mb-10 ${className}`}
    >
      <div className={centered ? '' : 'max-w-2xl'}>
        {eyebrow && (
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-violet-700 dark:text-violet-400 mb-2">
            {eyebrow}
          </p>
        )}
        <h2 id={id} className="text-fluid-section font-bold text-zinc-950 dark:text-zinc-50">
          {title}
        </h2>
        {description && <p className="mt-2.5 text-fluid-body text-zinc-600 dark:text-zinc-300">{description}</p>}
      </div>

      {action && (
        <div className={centered ? 'mt-5' : 'mt-4 sm:mt-0 shrink-0'}>
          {action.to ? (
            <Link
              to={action.to}
              className="group inline-flex items-center gap-1.5 text-sm font-semibold text-violet-700 hover:text-violet-900 dark:text-violet-400 dark:hover:text-violet-300 rounded-lg px-1 py-1"
            >
              {action.label}
              <span aria-hidden="true" className="transition-transform duration-200 group-hover:translate-x-0.5">
                →
              </span>
            </Link>
          ) : (
            action
          )}
        </div>
      )}
    </div>
  );
}
