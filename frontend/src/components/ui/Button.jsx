import { Link } from 'react-router-dom';

/**
 * The button system: three variants, three sizes, one focus treatment.
 *
 * Renders an `<a>`/`<Link>` when given `href`/`to` and a real `<button>`
 * otherwise, so navigation stays a link and actions stay buttons.
 */

const BASE =
  'inline-flex items-center justify-center gap-2 font-semibold rounded-xl ' +
  'transition-[background-color,border-color,color,box-shadow,transform] duration-200 ' +
  'disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]';

const VARIANTS = {
  primary:
    'bg-zinc-950 text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200 shadow-sm',
  secondary:
    'bg-white text-zinc-900 border border-zinc-300 hover:border-zinc-400 hover:bg-zinc-50 ' +
    'dark:bg-zinc-900 dark:text-zinc-100 dark:border-zinc-700 dark:hover:border-zinc-600 dark:hover:bg-zinc-800',
  /**
   * `secondary` over a photograph or a dark panel.
   *
   * A real variant rather than `secondary` plus a `text-white` override: both are
   * `text-*` utilities of equal specificity, so which one wins depends on
   * Tailwind's output order, not on the order they are written. The override lost,
   * leaving near-black text on a dark translucent fill.
   *
   * The only variant that keeps a ring: it sits on imagery in both themes, where
   * the global neutral outline can land on a light patch of photo. The white ring
   * replaces the outline, so `outline-none` is justified here and nowhere else.
   */
  secondaryOnDark:
    'bg-white/10 text-white border border-white/30 hover:border-white/50 hover:bg-white/20 ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-white',
  /**
   * WhatsApp actions. Deliberately the brand's own green in both themes —
   * recognition is what converts — replacing the previous pale emerald ghost
   * styling that read as colourless.
   */
  whatsapp: 'bg-[#25D366] text-white hover:bg-[#1fbf5b] shadow-sm',
  accent: 'bg-violet-600 text-white hover:bg-violet-700 shadow-sm',
  ghost: 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800',
  link:
    'text-violet-700 hover:text-violet-900 dark:text-violet-400 dark:hover:text-violet-300 ' +
    'underline-offset-4 hover:underline px-0',
};

const SIZES = {
  sm: 'h-9 px-3.5 text-xs',
  md: 'h-11 px-5 text-sm touch-target',
  lg: 'h-12 px-6 text-sm sm:text-base touch-target',
};

const Spinner = () => (
  <span
    aria-hidden="true"
    className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0"
  />
);

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  className = '',
  to,
  href,
  children,
  ...rest
}) {
  const classes = `${BASE} ${VARIANTS[variant] ?? VARIANTS.primary} ${
    variant === 'link' ? SIZES[size].replace(/px-[\d.]+/, '') : SIZES[size]
  } ${className}`;

  if (to) {
    return (
      <Link to={to} className={classes} {...rest}>
        {children}
      </Link>
    );
  }
  if (href) {
    return (
      <a href={href} className={classes} {...rest}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" className={classes} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading && <Spinner />}
      {children}
    </button>
  );
}
